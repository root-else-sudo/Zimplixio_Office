import { z } from 'zod'

// Client-safe env. NEXT_PUBLIC_* vars are inlined by Next.js at build time
// and are available in both server and browser bundles. Importing this file
// from a client component does NOT pull server-only secrets in.
const ClientSchema = z.object({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
})

const result = ClientSchema.safeParse({
  // Read each var explicitly so Next.js can inline them; reading process.env
  // dynamically (e.g. spread) defeats the build-time replacement.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
})

// During `next build` NEXT_PUBLIC_ vars may not be injected — skip throwing
// so the build completes. Missing vars will be caught at runtime.
if (!result.success && process.env.NEXT_PHASE !== 'phase-production-build') {
  const issues = result.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid client environment configuration:\n${issues}`)
}

export const clientEnv = (result.data ?? {}) as z.infer<typeof ClientSchema>
export type ClientEnv = typeof clientEnv
