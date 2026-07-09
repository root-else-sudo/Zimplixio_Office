import { prisma } from '../prisma'
import { logger } from '../logger'
import { callClaude, MODELS } from '../ai-client'
import { gatherSignal } from './tavily'
import {
  HYPOTHESIZE_TOOL,
  TEST_TOOL,
  DISTILL_TOOL,
  HypothesizeOutputSchema,
  TestOutputSchema,
  DistillOutputSchema,
  type Hypothesis,
} from './schemas'
import {
  HYPOTHESIZE_SYSTEM,
  TEST_SYSTEM,
  DISTILL_SYSTEM,
  hypothesizeUserMessage,
  testUserMessage,
  distillUserMessage,
} from './prompts'
import { isDuplicateTitle } from './dedupe'

const MAX_FINDINGS_PER_RUN = 5

export type ResearchEngineResult =
  | { aborted: true; reason: string }
  | { aborted: false; findingsCreated: number }

// The Research Engine loop (planning §2.3): Ground -> Gather -> Hypothesize ->
// Test -> Queue -> (Review happens async, in the UI) -> Learn. Learn can't run
// synchronously inside the job that produced the Findings being reviewed —
// review happens at the owner's own pace — so it runs at the START of the
// NEXT run instead, as part of Ground: distill whatever got validated/rejected
// since the Guidance Summary's own updatedAt (which doubles as the
// "already learned from this" watermark, including for a manual owner edit).
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
  let distillCostUsd = 0

  // ── Ground ────────────────────────────────────────────────────────────
  const department = await prisma.department.findUnique({ where: { key: 'PRODUCT_RESEARCH' } })
  const companyProfile = department
    ? await prisma.companyProfile.findUnique({ where: { departmentId: department.id } })
    : null

  if (!department || !companyProfile?.content.trim()) {
    log.info('research.engine: no Company Profile content, aborting before any API calls')
    return { aborted: true, reason: 'company_profile_empty' }
  }

  let guidanceSummary = await prisma.guidanceSummary.upsert({
    where: { departmentId: department.id },
    update: {},
    create: { departmentId: department.id, content: '' },
  })

  const reviewedSinceLastLearn = await prisma.finding.findMany({
    where: {
      departmentId: department.id,
      status: { in: ['VALIDATED', 'REJECTED'] },
      updatedAt: { gt: guidanceSummary.updatedAt },
    },
    select: { title: true, status: true, rejectionReason: true },
  })

  if (reviewedSinceLastLearn.length > 0) {
    const distillResponse = await callClaude({
      model: MODELS.PRIMARY,
      system: DISTILL_SYSTEM,
      messages: [
        {
          role: 'user',
          content: distillUserMessage({
            currentSummary: guidanceSummary.content,
            validatedTitles: reviewedSinceLastLearn
              .filter((f) => f.status === 'VALIDATED')
              .map((f) => f.title),
            rejected: reviewedSinceLastLearn
              .filter((f) => f.status === 'REJECTED')
              .map((f) => ({ title: f.title, reason: f.rejectionReason ?? '(no reason recorded)' })),
          }),
        },
      ],
      maxTokens: 1_000,
      tools: [DISTILL_TOOL],
      forceTool: DISTILL_TOOL.name,
      route: 'research.distill',
      userId: opts.triggeredByUserId,
    })
    distillCostUsd = distillResponse.costUsd

    const distillParsed = DistillOutputSchema.safeParse(distillResponse.toolInput)
    if (!distillParsed.success) {
      // A failed distill doesn't abort the whole run — Ground continues with
      // the summary as it stood before this attempt. Worth surfacing, not
      // worth losing an otherwise-good run over.
      log.error(
        { issues: distillParsed.error.issues, received: distillResponse.toolInput },
        'research.engine: distill output failed validation, continuing with prior Guidance Summary'
      )
    } else {
      guidanceSummary = await prisma.guidanceSummary.update({
        where: { departmentId: department.id },
        data: { content: distillParsed.data.summary },
      })
      log.info(
        { reviewedCount: reviewedSinceLastLearn.length, costUsd: distillCostUsd },
        'research.engine: distilled updated Guidance Summary'
      )
    }
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
          guidanceSummary: guidanceSummary.content,
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
        content: testUserMessage({
          companyProfile: companyProfile.content,
          guidanceSummary: guidanceSummary.content,
          hypotheses,
          signal,
        }),
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

  const costUsd = distillCostUsd + hypothesizeResponse.costUsd + testResponse.costUsd
  log.info(
    {
      durationMs: Date.now() - start,
      distilled: distillCostUsd > 0,
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
