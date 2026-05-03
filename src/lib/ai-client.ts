import Anthropic from '@anthropic-ai/sdk'
import { serverEnv } from './env'

// Singleton Anthropic SDK client. Phase 3 layers structured outputs, prompt
// caching, retries, and usage telemetry on top of this via a `callClaude`
// wrapper exported from this module.
export const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY })

// Centralised model catalogue. Switching providers/versions becomes a one-line
// change, and call sites get autocomplete instead of magic strings.
export const MODELS = {
  // Default for high-quality writing tasks (e.g. regenerate).
  PRIMARY: 'claude-sonnet-4-6',
  // Reserved for tasks that need deeper reasoning; opt-in per call.
  HEAVY: 'claude-opus-4-7',
  // Fast/cheap model for short structured outputs (e.g. analyze).
  FAST: 'claude-haiku-4-5-20251001',
} as const

export type ModelId = (typeof MODELS)[keyof typeof MODELS]
