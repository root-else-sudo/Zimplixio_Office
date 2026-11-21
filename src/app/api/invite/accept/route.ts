import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sameOrigin } from '@/lib/rbac'
import { rateLimit } from '@/lib/ratelimit'
import { apiError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { hashInviteToken } from '@/lib/admin/invite-tokens'
import { acceptInvite, InviteInvalidError, InvitePasswordError } from '@/lib/admin/accept-invite'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000
const INVALID_COPY = 'This invite link is invalid or has expired. Ask your Zimplixio admin for a new one.'

const bodySchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().max(1024),
})

// Public on purpose: the person has no account yet. Protected by a single-use
// hashed token, a same-origin check and the rate limits below.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return apiError('FORBIDDEN', 'Cross-origin request rejected')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: INVALID_COPY }, { status: 410 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: INVALID_COPY }, { status: 410 })
  const { token, password } = parsed.data

  const ip =
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const byIp = await rateLimit({ scope: 'invite.accept.ip', actor: ip, limit: 10, windowMs: WINDOW_MS })
  const byToken = await rateLimit({
    scope: 'invite.accept.token',
    actor: hashInviteToken(token),
    limit: 5,
    windowMs: WINDOW_MS,
  })
  if (!byIp.allowed || !byToken.allowed) {
    const retryAfter = Math.ceil(Math.max(byIp.retryAfterMs, byToken.retryAfterMs) / 1000)
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  try {
    const { email } = await acceptInvite(token, password)
    return NextResponse.json({ email })
  } catch (err) {
    if (err instanceof InvitePasswordError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof InviteInvalidError) return NextResponse.json({ error: INVALID_COPY }, { status: 410 })
    logger.error({ err }, 'invite accept failed')
    return apiError('INTERNAL_ERROR', 'Internal server error')
  }
}
