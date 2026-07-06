// Worker entry point. Runs as a long-lived Node process — see docs/RAILWAY.md
// for the production deploy topology. Locally, run `npm run worker`.
import './load-env' // MUST be first — populates process.env before env.ts parses it
import { startBoss } from '@/lib/pgboss'
import { logger } from '@/lib/logger'

// V1's job handlers (pipeline, opportunities, linkedin, cron) are retired with
// the rest of the V1 schema. The Research Engine job (planning §2.3/§4.4) is
// registered here once it's built (Increment 3).

async function main() {
  const boss = await startBoss()

  logger.info('worker started, no jobs registered yet')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    try {
      await boss.stop({ graceful: true, timeout: 30_000 })
    } catch (err) {
      logger.error({ err }, 'error during boss.stop')
    }
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error({ err }, 'worker boot failed')
  process.exit(1)
})
