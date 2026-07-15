import { callClaude, MODELS } from '../ai-client'
import { logger } from '../logger'
import type { ProbeSignalItemInput } from './gather'
import {
  ProbeSignalReviewOutputSchema,
  PROBE_REVIEW_TOOL,
  ProbeReviewDistillOutputSchema,
  PROBE_REVIEW_DISTILL_TOOL,
} from './schemas'
import {
  PROBE_REVIEW_SYSTEM,
  PROBE_REVIEW_DISTILL_SYSTEM,
  probeReviewUserMessage,
  probeReviewDistillUserMessage,
} from './prompts'

export interface ReviewedSignalItem extends ProbeSignalItemInput {
  includedInReasoning: boolean
  exclusionReason: string | null
}

// Judges every gathered item on two things only — genuinely about the named
// company (not a same-named different entity, not generic platform-wide
// noise), and not a near-duplicate of an earlier item in the batch. Does NOT
// judge business relevance to Zimplixio — that stays Hypothesize's job.
// MANUAL/TAVILY_EXTRACT items are owner-curated by definition, so their
// verdict is always overridden to included, regardless of what the model
// returns for them — the model still sees them so it can correctly spot a
// TAVILY_SEARCH duplicate of one, but its opinion of them is discarded.
export async function reviewSignal(opts: {
  companyName: string
  items: ProbeSignalItemInput[]
  guidance: string
  triggeredByUserId?: string
}): Promise<{ items: ReviewedSignalItem[]; costUsd: number }> {
  const response = await callClaude({
    model: MODELS.FAST,
    system: PROBE_REVIEW_SYSTEM,
    messages: [
      {
        role: 'user',
        content: probeReviewUserMessage({
          companyName: opts.companyName,
          guidance: opts.guidance,
          items: opts.items,
        }),
      },
    ],
    maxTokens: 2_000,
    tools: [PROBE_REVIEW_TOOL],
    forceTool: PROBE_REVIEW_TOOL.name,
    route: 'research-probe.review',
    userId: opts.triggeredByUserId,
  })

  const parsed = ProbeSignalReviewOutputSchema.safeParse(response.toolInput)
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues },
      'research-probe.review: output failed validation, including everything unfiltered'
    )
    return {
      items: opts.items.map((item) => ({ ...item, includedInReasoning: true, exclusionReason: null })),
      costUsd: response.costUsd,
    }
  }

  const verdictByIndex = new Map(parsed.data.reviewed.map((v) => [v.index, v]))
  const reviewed: ReviewedSignalItem[] = opts.items.map((item, index) => {
    if (item.group === 'manual' || item.group === 'tavily_extract') {
      return { ...item, includedInReasoning: true, exclusionReason: null }
    }
    const verdict = verdictByIndex.get(index)
    if (!verdict) {
      // Model omitted a verdict for this item — fail open, keep it, rather
      // than silently dropping real signal because of an incomplete response.
      return { ...item, includedInReasoning: true, exclusionReason: null }
    }
    return {
      ...item,
      content: verdict.include && verdict.cleanedContent ? verdict.cleanedContent : item.content,
      includedInReasoning: verdict.include,
      exclusionReason: verdict.include ? null : verdict.reason,
    }
  })

  return { items: reviewed, costUsd: response.costUsd }
}

// Rewrites the Review Guidance to reflect general noise patterns from this
// run's exclusions. Caller (engine.ts) only invokes this when at least one
// item was excluded. Returns null on validation failure so the caller can
// keep the prior guidance rather than losing it to a bad distill attempt.
export async function distillReviewGuidance(opts: {
  currentGuidance: string
  excluded: { source: string; title: string | null; reason: string }[]
  triggeredByUserId?: string
}): Promise<{ guidance: string; costUsd: number } | null> {
  const response = await callClaude({
    model: MODELS.FAST,
    system: PROBE_REVIEW_DISTILL_SYSTEM,
    messages: [
      {
        role: 'user',
        content: probeReviewDistillUserMessage({
          currentGuidance: opts.currentGuidance,
          excluded: opts.excluded,
        }),
      },
    ],
    maxTokens: 1_000,
    tools: [PROBE_REVIEW_DISTILL_TOOL],
    forceTool: PROBE_REVIEW_DISTILL_TOOL.name,
    route: 'research-probe.review-distill',
    userId: opts.triggeredByUserId,
  })

  const parsed = ProbeReviewDistillOutputSchema.safeParse(response.toolInput)
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues },
      'research-probe.review-distill: output failed validation, keeping prior guidance'
    )
    return null
  }

  return { guidance: parsed.data.guidance, costUsd: response.costUsd }
}
