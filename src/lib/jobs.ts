import {
  JOB_NAMES,
  type JobPayloads,
  ensureWebBossStarted,
} from './pgboss'

interface EnqueueOptions {
  // pg-boss singleton key — only one job with this key is queued+active at a
  // time. Used to prevent two parallel pipeline runs.
  singletonKey?: string
  // Optional retry policy override; defaults are sane for our use case.
  retryLimit?: number
}

async function enqueue<N extends keyof JobPayloads>(
  name: N,
  payload: JobPayloads[N],
  opts: EnqueueOptions = {}
): Promise<string | null> {
  const boss = await ensureWebBossStarted()
  return boss.send(name, payload, {
    singletonKey: opts.singletonKey,
    retryLimit: opts.retryLimit ?? 1,
  })
}

export function enqueuePipelineRun(payload: JobPayloads[typeof JOB_NAMES.PIPELINE_RUN]) {
  return enqueue(JOB_NAMES.PIPELINE_RUN, payload, {
    // One pipeline run at a time across the whole system.
    singletonKey: JOB_NAMES.PIPELINE_RUN,
  })
}

export function enqueueOpportunitiesFind(
  payload: JobPayloads[typeof JOB_NAMES.OPPORTUNITIES_FIND]
) {
  return enqueue(JOB_NAMES.OPPORTUNITIES_FIND, payload, {
    singletonKey: JOB_NAMES.OPPORTUNITIES_FIND,
  })
}
