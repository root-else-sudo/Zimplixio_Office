import { logger } from '@/lib/logger'
import { runResearchEngine } from '@/lib/research/engine'
import type { ResearchRunPayload } from '@/lib/pgboss'

// Thin pg-boss adapter. The actual Ground->Gather->Hypothesize->Test->Queue
// logic lives in src/lib/research/engine.ts and knows nothing about pg-boss.
//
// Error contract: engine.runResearchEngine() RETURNS { aborted: true, reason }
// for deterministic content/logic failures (empty Company Profile, no signal,
// a schema mismatch) — retrying those wastes a full cost cycle for the same
// outcome, so we log and return normally rather than throwing. Only letting an
// exception propagate from here causes pg-boss to retry (per the queue's
// retryLimit: 1) — reserved for genuine transient infra failures that escape
// callClaude's own retry logic.
export async function handleResearchRun(payload: ResearchRunPayload): Promise<void> {
  const result = await runResearchEngine({
    trigger: payload.trigger,
    triggeredByUserId: payload.triggeredByUserId,
  })

  if (result.aborted) {
    logger.info({ reason: result.reason }, 'research.run: aborted cleanly')
    return
  }

  logger.info({ findingsCreated: result.findingsCreated }, 'research.run: complete')
}
