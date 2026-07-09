import { prisma } from '../prisma'
import { logger } from '../logger'
import { callClaude, MODELS } from '../ai-client'
import { gatherSignal } from './tavily'
import {
  HYPOTHESIZE_TOOL,
  TEST_TOOL,
  HypothesizeOutputSchema,
  TestOutputSchema,
  type Hypothesis,
} from './schemas'
import { HYPOTHESIZE_SYSTEM, TEST_SYSTEM, hypothesizeUserMessage, testUserMessage } from './prompts'
import { isDuplicateTitle } from './dedupe'

const MAX_FINDINGS_PER_RUN = 5

export type ResearchEngineResult =
  | { aborted: true; reason: string }
  | { aborted: false; findingsCreated: number }

// The Research Engine loop (planning §2.3): Ground -> Gather -> Hypothesize ->
// Test -> Queue. Review (human gate) and Learn (Guidance Summary) are later
// increments — this stops at Queue.
//
// Framework-agnostic on purpose: no pg-boss import here, so the pg-boss job
// handler (worker/src/handlers/research.ts) stays a thin adapter and this
// logic is easy to reason about / re-run standalone.
export async function runResearchEngine(opts: {
  trigger: 'schedule' | 'run-now'
  triggeredByUserId?: string
}): Promise<ResearchEngineResult> {
  const start = Date.now()
  const log = logger.child({ route: 'research.engine', trigger: opts.trigger })

  // ── Ground ────────────────────────────────────────────────────────────
  // Extension point: a future Guidance Summary (learning loop, Increment 5)
  // would also be loaded here and folded into the prompts below.
  const department = await prisma.department.findUnique({ where: { key: 'PRODUCT_RESEARCH' } })
  const companyProfile = department
    ? await prisma.companyProfile.findUnique({ where: { departmentId: department.id } })
    : null

  if (!department || !companyProfile?.content.trim()) {
    log.info('research.engine: no Company Profile content, aborting before any API calls')
    return { aborted: true, reason: 'company_profile_empty' }
  }

  const existingFindings = await prisma.finding.findMany({
    where: { departmentId: department.id },
    select: { title: true },
  })
  const existingTitles = existingFindings.map((f) => f.title)

  // ── Gather ────────────────────────────────────────────────────────────
  const signal = await gatherSignal()
  if (signal.length === 0) {
    log.warn('research.engine: gather produced zero signal, aborting before any Claude calls')
    return { aborted: true, reason: 'no_signal_gathered' }
  }

  // ── Hypothesize ───────────────────────────────────────────────────────
  const hypothesizeResponse = await callClaude({
    model: MODELS.PRIMARY,
    system: HYPOTHESIZE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: hypothesizeUserMessage({
          companyProfile: companyProfile.content,
          existingTitles,
          signal,
        }),
      },
    ],
    maxTokens: 2_000,
    tools: [HYPOTHESIZE_TOOL],
    forceTool: HYPOTHESIZE_TOOL.name,
    route: 'research.hypothesize',
    userId: opts.triggeredByUserId,
  })

  const hypothesizeParsed = HypothesizeOutputSchema.safeParse(hypothesizeResponse.toolInput)
  if (!hypothesizeParsed.success) {
    log.error(
      { issues: hypothesizeParsed.error.issues, received: hypothesizeResponse.toolInput },
      'research.engine: hypothesize output failed validation'
    )
    return { aborted: true, reason: 'hypothesize_validation_failed' }
  }

  const hypotheses: Hypothesis[] = hypothesizeParsed.data.hypotheses
  if (hypotheses.length === 0) {
    log.info('research.engine: hypothesize returned no candidates, nothing to test')
    return { aborted: true, reason: 'no_hypotheses' }
  }

  // ── Test ──────────────────────────────────────────────────────────────
  const testResponse = await callClaude({
    model: MODELS.PRIMARY,
    system: TEST_SYSTEM,
    messages: [
      {
        role: 'user',
        content: testUserMessage({ companyProfile: companyProfile.content, hypotheses, signal }),
      },
    ],
    maxTokens: 4_000,
    tools: [TEST_TOOL],
    forceTool: TEST_TOOL.name,
    route: 'research.test',
    userId: opts.triggeredByUserId,
  })

  const testParsed = TestOutputSchema.safeParse(testResponse.toolInput)
  if (!testParsed.success) {
    log.error(
      { issues: testParsed.error.issues, received: testResponse.toolInput },
      'research.engine: test output failed validation'
    )
    return { aborted: true, reason: 'test_validation_failed' }
  }

  // ── Queue ─────────────────────────────────────────────────────────────
  // Deterministic filtering in TypeScript, not trusted to the model.
  const survivors = testParsed.data.testedHypotheses
    .filter((h) => h.confidence !== 'LOW')
    .filter((h) => !isDuplicateTitle(h.title, existingTitles))
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'HIGH' ? -1 : 1))
    .slice(0, MAX_FINDINGS_PER_RUN)

  if (survivors.length > 0) {
    await prisma.finding.createMany({
      data: survivors.map((h) => ({
        departmentId: department.id,
        title: h.title,
        evidence: h.evidence,
        fitRationale: h.fitRationale,
        status: 'CANDIDATE' as const,
      })),
    })
  }

  const costUsd = hypothesizeResponse.costUsd + testResponse.costUsd
  log.info(
    {
      durationMs: Date.now() - start,
      tavilyItems: signal.length,
      hypothesesGenerated: hypotheses.length,
      hypothesesTested: testParsed.data.testedHypotheses.length,
      findingsCreated: survivors.length,
      costUsd,
    },
    'research.engine: run complete'
  )

  return { aborted: false, findingsCreated: survivors.length }
}
