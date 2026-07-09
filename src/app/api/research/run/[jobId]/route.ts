export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { toApiError, apiError } from '@/lib/errors'
import { ensureWebBossStarted, JOB_NAMES } from '@/lib/pgboss'

// Polled by RunResearchButton to know when a triggered run finishes, so the
// Findings list can refresh itself instead of requiring a manual page
// reload. No new run-status table — pg-boss already tracks job state, this
// just reads it.
export const GET = withAuth<{ jobId: string }>(async (_req, ctx) => {
  const { jobId } = await ctx.params
  try {
    const boss = await ensureWebBossStarted()
    const job = await boss.getJobById(JOB_NAMES.RESEARCH_RUN, jobId)
    if (!job) return apiError('NOT_FOUND', 'Job not found')
    return NextResponse.json({ state: job.state })
  } catch (err) {
    return toApiError(err, 'research.run.status')
  }
})
