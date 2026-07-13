export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { rateLimit } from '@/lib/ratelimit'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'
import { runResearchProbe } from '@/lib/research-probe/engine'

const RunSchema = z.object({
  companyName: z.string().min(1).max(200),
  manualNotes: z.string().max(5000).optional(),
  urls: z.array(z.string().url()).max(5).optional(),
})

// Runs synchronously (design doc §2) — this can take up to ~60s (Tavily
// gather + two Claude calls), which is fine on Railway's long-lived process,
// unlike a serverless platform with a hard execution-time limit.
const RUN_LIMIT = 1
const RUN_WINDOW_MS = 2 * 60 * 1000

export const POST = withAuth(async (req, _ctx, session) => {
  const limit = await rateLimit({
    scope: 'research-probe.run',
    actor: session.user.id,
    limit: RUN_LIMIT,
    windowMs: RUN_WINDOW_MS,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'A probe run was triggered too recently — try again shortly', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': Math.ceil(limit.retryAfterMs / 1000).toString() } }
    )
  }

  const parsed = await parseJson(req, RunSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const department = await prisma.department.findUnique({ where: { key: 'PRODUCT_RESEARCH' } })
    if (!department) return apiError('NOT_FOUND', 'Product/Research department not found')

    const { runId } = await runResearchProbe({
      departmentId: department.id,
      companyName: parsed.data.companyName,
      manualNotes: parsed.data.manualNotes,
      urls: parsed.data.urls,
      triggeredByUserId: session.user.id,
    })

    return NextResponse.json({ runId })
  } catch (err) {
    return toApiError(err, 'research-probe.run')
  }
})
