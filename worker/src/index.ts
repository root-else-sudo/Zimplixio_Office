// Worker entry point. Runs as a long-lived Node process — see docs/RAILWAY.md
// for the production deploy topology. Locally, run `npm run worker`.
import './load-env' // MUST be first — populates process.env before env.ts parses it
import { startBoss, JOB_NAMES, type JobPayloads } from '@/lib/pgboss'
import { logger } from '@/lib/logger'
import { handlePipelineRun } from './handlers/pipeline'
import { handleOpportunitiesFind } from './handlers/opportunities'

async function main() {
  const boss = await startBoss()

  // Register handlers. pg-boss serializes per-job-name by default; the
  // singleton key on enqueue is what enforces "only one pipeline at a time"
  // across the whole system.
  await boss.work<JobPayloads[typeof JOB_NAMES.PIPELINE_RUN]>(
    JOB_NAMES.PIPELINE_RUN,
    async ([job]) => {
      logger.info({ jobId: job.id, payload: job.data }, 'pipeline.run picked up')
      await handlePipelineRun(job.data)
    }
  )

  await boss.work<JobPayloads[typeof JOB_NAMES.OPPORTUNITIES_FIND]>(
    JOB_NAMES.OPPORTUNITIES_FIND,
    async ([job]) => {
      logger.info({ jobId: job.id, payload: job.data }, 'opportunities.find picked up')
      await handleOpportunitiesFind(job.data)
    }
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
