// Next.js calls register() once at server startup (both Node and Edge runtimes).
// We use it to validate environment configuration up-front so a misconfigured
// deploy crashes immediately instead of failing on the first matching request.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env')
  }
}
