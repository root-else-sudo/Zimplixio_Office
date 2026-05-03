import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

export const AnalyzeOptionsSchema = z.object({
  options: z
    .array(z.string().min(1).max(100))
    .length(4, 'Must return exactly 4 options'),
})

export type AnalyzeOptions = z.infer<typeof AnalyzeOptionsSchema>

export const RewrittenPostSchema = z.object({
  content: z.string().min(20).max(4_000),
})

export type RewrittenPost = z.infer<typeof RewrittenPostSchema>

// JSON schemas Anthropic's tool-use API expects, derived from the Zod schemas
// so the source of truth lives in one place. Cast required because
// zod-to-json-schema's typings target Zod v3 while we run Zod v4 — runtime is
// compatible, only the .d.ts is stale.
function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema as never, { target: 'jsonSchema7' }) as Record<
    string,
    unknown
  >
  delete json.$schema
  return json
}

export const ANALYZE_TOOL = {
  name: 'propose_revision_options',
  description:
    'Propose exactly 4 revision directions for the LinkedIn draft. Each option is a short imperative phrase under 12 words.',
  input_schema: toJsonSchema(AnalyzeOptionsSchema),
}

export const REGENERATE_TOOL = {
  name: 'submit_rewritten_post',
  description:
    'Return the rewritten LinkedIn post that incorporates the reviewer feedback. Plain text only — no preamble, no quotes.',
  input_schema: toJsonSchema(RewrittenPostSchema),
}
