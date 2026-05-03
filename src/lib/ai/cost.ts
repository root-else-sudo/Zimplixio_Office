import type { ModelId } from '../ai-client'

// USD cost per 1 million tokens, by token bucket.
// Source: https://platform.claude.com/docs/en/pricing (cached 2026-04-15).
// Cache write rate is 1.25× input ($/MTok); cache read rate is 0.1× input.
interface ModelPrice {
  inputUsdPer1M: number
  outputUsdPer1M: number
  cacheWriteUsdPer1M: number
  cacheReadUsdPer1M: number
}

const PRICES: Record<ModelId, ModelPrice> = {
  'claude-opus-4-7': {
    inputUsdPer1M: 5,
    outputUsdPer1M: 25,
    cacheWriteUsdPer1M: 6.25,
    cacheReadUsdPer1M: 0.5,
  },
  'claude-sonnet-4-6': {
    inputUsdPer1M: 3,
    outputUsdPer1M: 15,
    cacheWriteUsdPer1M: 3.75,
    cacheReadUsdPer1M: 0.3,
  },
  'claude-haiku-4-5-20251001': {
    inputUsdPer1M: 1,
    outputUsdPer1M: 5,
    cacheWriteUsdPer1M: 1.25,
    cacheReadUsdPer1M: 0.1,
  },
}

export interface UsageCounts {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export function computeCostUsd(model: ModelId, usage: UsageCounts): number {
  const p = PRICES[model]
  if (!p) return 0
  return (
    (usage.inputTokens * p.inputUsdPer1M +
      usage.outputTokens * p.outputUsdPer1M +
      usage.cacheCreationTokens * p.cacheWriteUsdPer1M +
      usage.cacheReadTokens * p.cacheReadUsdPer1M) /
    1_000_000
  )
}
