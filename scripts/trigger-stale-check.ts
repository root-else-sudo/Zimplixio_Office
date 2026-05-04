// Manually enqueue one stale-draft check. Useful for testing the cron handler
// without waiting for the next 6-hour tick.
//
//   npm run trigger:stale-check
//
// The worker (npm run worker) must be running to pick the job up.
import './load-env'
import { ensureWebBossStarted, JOB_NAMES } from '@/lib/pgboss'
import { logger } from '@/lib/logger'

async function main() {
  const boss = await ensureWebBossStarted()
  const jobId = await boss.send(JOB_NAMES.STALE_DRAFTS_CHECK, { triggered: 'cron' })
  logger.info({ jobId }, 'enqueued stale-drafts check')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'trigger failed')
    process.exit(1)
  })
