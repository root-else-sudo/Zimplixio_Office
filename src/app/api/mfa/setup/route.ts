export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTotpFactor, verifyTotpSetup } from '@/lib/twilio'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'
import { createMfaProof } from '@/lib/mfa-proof'

const SetupSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create') }),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') }),
])

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const parsed = await parseJson(req, SetupSchema)
  if (parsed instanceof NextResponse) return parsed
  const body = parsed.data

  const userId = session.user.id

  try {
    // This route skips the normal MFA gate so first-time enrollment works.
    // Once a factor is enrolled it is never replaced here (even by a verified session):
    // re-enrollment is admin-reset only, otherwise a stolen session could swap the authenticator.
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true } })
    if (current?.mfaEnabled) {
      return apiError('FORBIDDEN', 'MFA is already set up for this account')
    }

    if (body.action === 'create') {
      const factor = await createTotpFactor(
        userId,
        session.user.name ?? session.user.email ?? userId
      )
      await prisma.user.update({
        where: { id: userId },
        data: { mfaSecret: factor.sid },
      })
      return NextResponse.json({
        factorSid: factor.sid,
        bindingUri: (factor.binding as { uri?: string } | undefined)?.uri,
      })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.mfaSecret) return apiError('VALIDATION_ERROR', 'No factor found')

    const ok = await verifyTotpSetup(userId, user.mfaSecret, body.code)
    if (!ok) return apiError('VALIDATION_ERROR', 'Invalid code')

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    })
    // They just proved the new factor — this proof marks the session verified.
    return NextResponse.json({ ok: true, proof: createMfaProof(userId, session.user.sid) })
  } catch (err) {
    return toApiError(err, 'mfa.setup')
  }
}, { audience: 'any', skipMfaCheck: true, allowUnenrolled: true })
