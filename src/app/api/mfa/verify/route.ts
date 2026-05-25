export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTotpCode } from '@/lib/twilio'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'
import { rateLimit } from '@/lib/ratelimit'

const VerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

const MFA_LIMIT = 5
const MFA_WINDOW_MS = 15 * 60 * 1000

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const limit = await rateLimit({
    scope: 'mfa.verify',
    actor: session.user.id,
    limit: MFA_LIMIT,
    windowMs: MFA_WINDOW_MS,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(limit.retryAfterMs / 1000).toString() },
      }
    )
  }

  const parsed = await parseJson(req, VerifySchema)
  if (parsed instanceof NextResponse) return parsed
  const { code } = parsed.data

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })
    if (!user?.mfaSecret) {
      return apiError('VALIDATION_ERROR', 'MFA not configured')
    }

    const ok = await verifyTotpCode(session.user.id, user.mfaSecret, code)
    if (!ok) return apiError('VALIDATION_ERROR', 'Invalid code')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toApiError(err, 'mfa.verify')
  }
})
