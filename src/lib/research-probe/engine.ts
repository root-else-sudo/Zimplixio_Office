import { prisma } from '../prisma'
import { logger } from '../logger'
import { callClaude, MODELS } from '../ai-client'
import { gatherProbeSignal } from './gather'
import {
  PROBE_HYPOTHESIZE_TOOL,
  PROBE_TEST_TOOL,
  ProbeHypothesizeOutputSchema,
  ProbeTestOutputSchema,
} from './schemas'
import {
  PROBE_HYPOTHESIZE_SYSTEM,
  PROBE_TEST_SYSTEM,
  probeHypothesizeUserMessage,
  probeTestUserMessage,
} from './prompts'

// Runs Gather -> Hypothesize -> Test for ONE named company and persists every
// step's real output, survivors and rejects alike (design doc §3, §5). Fully
// synchronous — no pg-boss/Worker involvement (design doc §2). This is the
// only exported entry point; src/app/api/research-probe/run/route.ts calls it
// directly and awaits the result within one request.
export async function runResearchProbe(opts: {
  departmentId: string
  companyName: string
  manualNotes?: string
  urls?: string[]
  triggeredByUserId?: string
}): Promise<{ runId: string }> {
  const log = logger.child({ route: 'research-probe.engine', companyName: opts.companyName })

  const run = await prisma.probeRun.create({
    data: {
      departmentId: opts.departmentId,
      companyName: opts.companyName,
      manualNotes: opts.manualNotes,
      status: 'RUNNING',
    },
  })

  try {
    const companyProfile = await prisma.companyProfile.findUnique({
      where: { departmentId: opts.departmentId },
    })
    if (!companyProfile?.content.trim()) {
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'Company Profile is empty', completedAt: new Date() },
      })
      return { runId: run.id }
    }

    const signal = await gatherProbeSignal({
      companyName: opts.companyName,
      manualNotes: opts.manualNotes,
      urls: opts.urls,
    })

    if (signal.length === 0) {
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'No signal gathered — nothing to reason about', completedAt: new Date() },
      })
      return { runId: run.id }
    }

    await prisma.probeSignalItem.createMany({
      data: signal.map((item) => ({
        runId: run.id,
        source: item.group === 'manual' ? 'MANUAL' : item.group === 'tavily_search' ? 'TAVILY_SEARCH' : 'TAVILY_EXTRACT',
        title: item.title,
        url: item.url,
        content: item.content,
      })),
    })

    const hypothesizeResponse = await callClaude({
      model: MODELS.PRIMARY,
      system: PROBE_HYPOTHESIZE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: probeHypothesizeUserMessage({
            companyName: opts.companyName,
            companyProfile: companyProfile.content,
            signal,
          }),
        },
      ],
      maxTokens: 2_000,
      tools: [PROBE_HYPOTHESIZE_TOOL],
      forceTool: PROBE_HYPOTHESIZE_TOOL.name,
      route: 'research-probe.hypothesize',
      userId: opts.triggeredByUserId,
    })

    const hypothesizeParsed = ProbeHypothesizeOutputSchema.safeParse(hypothesizeResponse.toolInput)
    if (!hypothesizeParsed.success) {
      log.error({ issues: hypothesizeParsed.error.issues }, 'research-probe: hypothesize output failed validation')
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'Hypothesize output failed validation', completedAt: new Date() },
      })
      return { runId: run.id }
    }

    const hypotheses = hypothesizeParsed.data.hypotheses
    let costUsd = hypothesizeResponse.costUsd

    if (hypotheses.length === 0) {
      // Not a failure — a real, informative result: nothing credible was found.
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETE', costUsd, completedAt: new Date() },
      })
      return { runId: run.id }
    }

    const testResponse = await callClaude({
      model: MODELS.PRIMARY,
      system: PROBE_TEST_SYSTEM,
      messages: [
        {
          role: 'user',
          content: probeTestUserMessage({
            companyName: opts.companyName,
            companyProfile: companyProfile.content,
            hypotheses,
            signal,
          }),
        },
      ],
      maxTokens: 4_000,
      tools: [PROBE_TEST_TOOL],
      forceTool: PROBE_TEST_TOOL.name,
      route: 'research-probe.test',
      userId: opts.triggeredByUserId,
    })
    costUsd += testResponse.costUsd

    const testParsed = ProbeTestOutputSchema.safeParse(testResponse.toolInput)
    if (!testParsed.success) {
      log.error({ issues: testParsed.error.issues }, 'research-probe: test output failed validation')
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'Test output failed validation', costUsd, completedAt: new Date() },
      })
      return { runId: run.id }
    }

    const tested = testParsed.data.testedHypotheses
    if (tested.length !== hypotheses.length) {
      log.error(
        { hypothesesCount: hypotheses.length, testedCount: tested.length },
        'research-probe: test returned a different count than hypotheses given'
      )
      await prisma.probeRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage: `Test returned ${tested.length} entries for ${hypotheses.length} hypotheses`,
          costUsd,
          completedAt: new Date(),
        },
      })
      return { runId: run.id }
    }

    await prisma.probeHypothesis.createMany({
      data: hypotheses.map((h, i) => ({
        runId: run.id,
        need: h.need,
        proposedService: h.proposedService,
        basedOnSignal: h.basedOnSignal,
        title: tested[i].title,
        evidence: tested[i].evidence,
        fitRationale: tested[i].fitRationale,
        confidence: tested[i].confidence,
        disconfirmingEvidence: tested[i].disconfirmingEvidence,
      })),
    })

    await prisma.probeRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETE', costUsd, completedAt: new Date() },
    })

    log.info(
      { hypothesesCreated: hypotheses.length, costUsd },
      'research-probe: run complete'
    )

    return { runId: run.id }
  } catch (err) {
    log.error({ err }, 'research-probe: run threw an unhandled error')
    await prisma.probeRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        completedAt: new Date(),
      },
    })
    return { runId: run.id }
  }
}
