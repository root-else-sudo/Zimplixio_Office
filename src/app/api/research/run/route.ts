export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { rateLimit } from '@/lib/ratelimit'
import { toApiError } from '@/lib/errors'
import { ensureWebBossStarted, JOB_NAMES } from '@/lib/pgboss'

const RUN_LIMIT = 1
const RUN_WINDOW_MS = 5 * 60 * 1000

// No role restriction — same precedent as the Findings routes (Increment 2:
// two-person team, nothing in the docs calls for restricting this). This one
// spends real money though, so it's rate-limited per the security doc's
// requirement for any route triggering paid API calls.
export const POST = withAuth(async (_req: NextRequest, _ctx, session) => {
  const limit = await rateLimit({
    scope: 'research.run',
    actor: session.user.id,
    limit: RUN_LIMIT,
    windowMs: RUN_WINDOW_MS,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'A research run was triggered too recently — try again shortly', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': Math.ceil(limit.retryAfterMs / 1000).toString() } }
    )
  }

  try {
    const boss = await ensureWebBossStarted()

    // pg-boss's `singleton` queue policy only guards against two ACTIVE jobs
    // — its unique index is scoped to state='active', so two sends in quick
    // succession could both land in 'created' state before either is picked
    // up. getQueueSize(..., { before: 'completed' }) counts anything not yet
    // finished (created + retry + active), which is the actual "already in
    // progress" check this route needs.
    const inFlight = await boss.getQueueSize(JOB_NAMES.RESEARCH_RUN, { before: 'completed' })
    if (inFlight > 0) {
      return NextResponse.json(
        { error: 'A research run is already in progress', code: 'CONFLICT' },
        { status: 409 }
      )
    }

    const jobId = await boss.send(
      JOB_NAMES.RESEARCH_RUN,
      { trigger: 'run-now', triggeredByUserId: session.user.id },
      { singletonKey: JOB_NAMES.RESEARCH_RUN }
    )

    return NextResponse.json({ ok: true, jobId })
  } catch (err) {
    return toApiError(err, 'research.run')
  }
})
