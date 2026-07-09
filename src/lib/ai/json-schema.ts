import { z } from 'zod'

// JSON schemas Anthropic's tool-use API expects, derived from Zod schemas so
// the source of truth lives in one place.
//
// Uses Zod v4's own native z.toJSONSchema() — NOT the third-party
// `zod-to-json-schema` package. That package's v3.x line reads Zod's internal
// `_def` structure directly, which changed shape in Zod v4; against this
// repo's Zod v4.4.3 it silently produces `{}` (no error, no warning) rather
// than a usable schema, which Anthropic's API then rejects with "input_schema
// .type: Field required". Confirmed by direct comparison during Increment 3
// development — verify this again if Zod is ever majorly upgraded.
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json.$schema
  return json
}
