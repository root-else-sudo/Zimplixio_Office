import { z } from 'zod'

const ServerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a URL'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 chars'),

  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  // Path to the Zimplixio_Marketing repo. Required by the worker (Phase 4);
  // optional in the web service since /api/pipeline currently shells out from
  // the request handler. Will become required in the worker's own schema.
  MARKETING_DIR: z.string().min(1).optional(),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1),
  TWILIO_SMS_FROM: z.string().min(1),
  SMS_NOTIFY_TO: z.string().min(1),

  VAPID_EMAIL: z.string().email('VAPID_EMAIL must be an email'),
  VAPID_PRIVATE_KEY: z.string().min(1),

  // LinkedIn publishing is stubbed; both vars are optional until wired up.
  LINKEDIN_ACCESS_TOKEN: z.string().min(1).optional(),
  LINKEDIN_AUTHOR_ID: z.string().min(1).optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Phase 4 feature flag. When `true`, the web service enqueues a pg-boss job
  // and returns immediately. The worker process runs the pipeline. When
  // `false`, the legacy in-request `child_process.exec` path runs (for
  // emergency rollback only).
  PIPELINE_USE_QUEUE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

function parseOrThrow<T>(schema: z.ZodSchema<T>, source: NodeJS.ProcessEnv, label: string): T {
  const result = schema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid ${label} environment configuration:\n${issues}`)
  }
  return result.data
}

// During `next build` env vars are not injected — skip validation so the
// build can complete. The real validation runs at server startup (runtime).
export const serverEnv =
  process.env.NEXT_PHASE === 'phase-production-build'
    ? ({} as z.infer<typeof ServerSchema>)
    : parseOrThrow(ServerSchema, process.env, 'server')

export type ServerEnv = typeof serverEnv
