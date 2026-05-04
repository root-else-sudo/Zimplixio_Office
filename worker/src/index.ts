// Worker entry point. Runs as a long-lived Node process — see docs/RAILWAY.md
// for the production deploy topology. Locally, run `npm run worker`.
import './load-env' // MUST be first — populates process.env before env.ts parses it
import { startBoss, JOB_NAMES, type JobPayloads } from '@/lib/pgboss'
import { logger } from '@/lib/logger'
import { handlePipelineRun } from './handlers/pipeline'
import { handleOpportunitiesFind } from './handlers/opportunities'
import { handleLinkedInPublish } from './handlers/linkedin'
import { handleStaleDraftsCheck } from './handlers/cron'

async function main() {
  const boss = await startBoss()

  // pg-boss v10 requires queues to exist before schedule() can reference them.
  // createQueue is idempotent on existing queues, but parallel creates of
  // distinct queues deadlock on a shared table lock — serialise the calls.
  for (const name of Object.values(JOB_NAMES)) {
    await boss.createQueue(name)
  }

  // pg-boss serializes per-job-name by default; the singleton key on enqueue
  // is what enforces "only one pipeline at a time" across the whole system.
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

  await boss.work<JobPayloads[typeof JOB_NAMES.LINKEDIN_PUBLISH]>(
    JOB_NAMES.LINKEDIN_PUBLISH,
    async ([job]) => {
      logger.info({ jobId: job.id, webhookId: job.data.webhookId }, 'linkedin.publish picked up')
      await handleLinkedInPublish(job.data)
    }
  )

  await boss.work<JobPayloads[typeof JOB_NAMES.STALE_DRAFTS_CHECK]>(
    JOB_NAMES.STALE_DRAFTS_CHECK,
    async ([job]) => {
      logger.info({ jobId: job.id }, 'drafts.stale-check picked up')
      await handleStaleDraftsCheck()
    }
  )

  // Cron — every 6 hours. boss.schedule is idempotent: re-registering the same
  // name updates the schedule rather than queuing duplicates.
  await boss.schedule(JOB_NAMES.STALE_DRAFTS_CHECK, '0 */6 * * *', { triggered: 'cron' })

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
