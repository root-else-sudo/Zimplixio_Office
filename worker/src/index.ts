// Worker entry point. Runs as a long-lived Node process — see docs/RAILWAY.md
// for the production deploy topology. Locally, run `npm run worker`.
import './load-env' // MUST be first — populates process.env before env.ts parses it
import { startBoss, JOB_NAMES, type JobPayloads } from '@/lib/pgboss'
import { logger } from '@/lib/logger'
import { handleResearchRun } from './handlers/research'

// V1's job handlers (pipeline, opportunities, linkedin, cron) are retired with
// the rest of the V1 schema.

async function main() {
  const boss = await startBoss()

  // singleton: pg-boss guarantees at most one ACTIVE job at a time (its
  // unique index is scoped to state='active', not 'created') — prevents two
  // runs executing concurrently. The "already in progress" check for jobs
  // merely queued-but-not-yet-active lives in the Run-now route via
  // getQueueSize(..., { before: 'completed' }), since the queue policy alone
  // doesn't cover that gap.
  await boss.createQueue(JOB_NAMES.RESEARCH_RUN, {
    name: JOB_NAMES.RESEARCH_RUN,
    policy: 'singleton',
    retryLimit: 1,
    retryDelay: 60,
    expireInHours: 1,
  })

  await boss.work<JobPayloads[typeof JOB_NAMES.RESEARCH_RUN]>(
    JOB_NAMES.RESEARCH_RUN,
    async ([job]) => {
      logger.info({ jobId: job.id, trigger: job.data.trigger }, 'research.run picked up')
      await handleResearchRun(job.data)
    }
  )

  // Weekly, Monday 08:00 UTC (before US business hours). Explicit tz avoids
  // DST wall-clock ambiguity.
  await boss.schedule(
    JOB_NAMES.RESEARCH_RUN,
    '0 8 * * 1',
    { trigger: 'schedule' },
    { tz: 'UTC' }
  )

  logger.info('worker handlers registered, waiting for jobs')

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
