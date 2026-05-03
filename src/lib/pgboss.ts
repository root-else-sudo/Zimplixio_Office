import PgBoss from 'pg-boss'
import { serverEnv } from './env'
import { logger } from './logger'

// Job names. Strongly typed so enqueue / handler registration can't drift.
export const JOB_NAMES = {
  PIPELINE_RUN: 'pipeline.run',
  OPPORTUNITIES_FIND: 'opportunities.find',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]

// Per-job payload shapes.
export interface PipelineRunPayload {
  runId: string
  agentId: string
}

export interface OpportunitiesFindPayload {
  triggeredByUserId: string
}

export interface JobPayloads {
  [JOB_NAMES.PIPELINE_RUN]: PipelineRunPayload
  [JOB_NAMES.OPPORTUNITIES_FIND]: OpportunitiesFindPayload
}

const globalForBoss = globalThis as unknown as { boss?: PgBoss }

// pg-boss owns its own `pgboss` schema in the configured database. First start
// runs the schema migration automatically; subsequent starts no-op.
export function getBoss(): PgBoss {
  if (globalForBoss.boss) return globalForBoss.boss
  const boss = new PgBoss({
    connectionString: serverEnv.DATABASE_URL,
    schema: 'pgboss',
  })
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'))
  globalForBoss.boss = boss
  return boss
}

// Worker-side: start the boss instance. Call once at process startup.
export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss()
  await boss.start()
  logger.info('pg-boss started')
  return boss
}

// Web-side: only used by request handlers that enqueue jobs. Lazily starts the
// boss on first call. The web service does not consume jobs — it only writes
// them — so this is safe to call from a request handler.
let webBossStarted = false
export async function ensureWebBossStarted(): Promise<PgBoss> {
  const boss = getBoss()
  if (!webBossStarted) {
    await boss.start()
    webBossStarted = true
    logger.info('pg-boss started (web enqueuer)')
  }
  return boss
}
