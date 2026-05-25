import Anthropic from '@anthropic-ai/sdk'
import pRetry from 'p-retry'
import { serverEnv } from './env'
import { logger } from './logger'
import { prisma } from './prisma'
import { computeCostUsd, type UsageCounts } from './ai/cost'

// Lazy singleton — never instantiated at module load (build time serverEnv is empty).
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY })
  return _anthropic
}

// Centralised model catalogue. Switching providers/versions becomes a one-line
// change and call sites get autocomplete instead of magic strings.
export const MODELS = {
  PRIMARY: 'claude-sonnet-4-6',
  HEAVY: 'claude-opus-4-7',
  FAST: 'claude-haiku-4-5-20251001',
} as const

export type ModelId = (typeof MODELS)[keyof typeof MODELS]

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface CallClaudeOptions {
  model: ModelId
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens: number
  tools?: ToolDefinition[]
  forceTool?: string
  cacheSystem?: boolean
  // Telemetry attribution
  route: string
  userId?: string
}

export interface ClaudeResponse {
  text: string
  toolInput?: Record<string, unknown>
  toolName?: string
  stopReason: string | null
  usage: UsageCounts
  costUsd: number
  latencyMs: number
}

// Retryable error predicate — rate limits and 5xx are safe to retry; bad
// requests / auth failures are not.
function shouldRetry(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true
  if (err instanceof Anthropic.InternalServerError) return true
  if (err instanceof Anthropic.APIError) {
    return err.status !== undefined && err.status >= 500
  }
  return false
}

export async function callClaude(opts: CallClaudeOptions): Promise<ClaudeResponse> {
  const start = Date.now()

  const systemBlock: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: opts.system,
      // Cache the system block when caller opts in. Min cacheable prefix is
      // ~2k–4k tokens depending on model — short prompts silently won't cache
      // and report cache_creation_input_tokens=0 (not an error).
      ...(opts.cacheSystem ? { cache_control: { type: 'ephemeral' as const } } : {}),
    },
  ]

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: systemBlock,
    messages: opts.messages,
    ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools as Anthropic.ToolUnion[] } : {}),
    ...(opts.forceTool
      ? { tool_choice: { type: 'tool' as const, name: opts.forceTool } }
      : {}),
  }

  let response: Anthropic.Message
  let success = true
  let errorCode: string | undefined

  try {
    response = await pRetry(() => getAnthropic().messages.create(params), {
      retries: 3,
      minTimeout: 500,
      maxTimeout: 5_000,
      randomize: true,
      shouldRetry,
      onFailedAttempt: (e) =>
        logger.warn(
          { route: opts.route, attempt: e.attemptNumber, err: e.error?.message },
          'claude call attempt failed'
        ),
    })
  } catch (err) {
    success = false
    if (err instanceof Anthropic.APIError) {
      errorCode = err.status ? `HTTP_${err.status}` : err.name
    } else {
      errorCode = err instanceof Error ? err.name : 'UNKNOWN'
    }

    const latencyMs = Date.now() - start
    void recordCall({
      route: opts.route,
      userId: opts.userId,
      model: opts.model,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      latencyMs,
      success,
      errorCode,
    })
    throw err
  }

  const latencyMs = Date.now() - start

  // Extract first text block and first tool_use block (if any).
  let text = ''
  let toolInput: Record<string, unknown> | undefined
  let toolName: string | undefined
  for (const block of response.content) {
    if (block.type === 'text' && !text) text = block.text
    if (block.type === 'tool_use' && !toolInput) {
      toolInput = block.input as Record<string, unknown>
      toolName = block.name
    }
  }

  const usage: UsageCounts = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  }
  const costUsd = computeCostUsd(opts.model, usage)

  void recordCall({
    route: opts.route,
    userId: opts.userId,
    model: opts.model,
    usage,
    latencyMs,
    success: true,
    costUsd,
  })

  return {
    text,
    toolInput,
    toolName,
    stopReason: response.stop_reason ?? null,
    usage,
    costUsd,
    latencyMs,
  }
}

interface RecordCallArgs {
  route: string
  userId?: string
  model: string
  usage: UsageCounts
  latencyMs: number
  success: boolean
  costUsd?: number
  errorCode?: string
}

// Fire-and-forget telemetry write. Failures are logged but never block the
// caller — telemetry is observability, not correctness.
async function recordCall(args: RecordCallArgs): Promise<void> {
  try {
    await prisma.llmCall.create({
      data: {
        userId: args.userId,
        route: args.route,
        model: args.model,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        cacheCreationTokens: args.usage.cacheCreationTokens,
        cacheReadTokens: args.usage.cacheReadTokens,
        latencyMs: args.latencyMs,
        success: args.success,
        errorCode: args.errorCode,
        costUsd: args.costUsd,
      },
    })
  } catch (err) {
    logger.error({ err, route: args.route }, 'llm telemetry write failed')
  }
}
