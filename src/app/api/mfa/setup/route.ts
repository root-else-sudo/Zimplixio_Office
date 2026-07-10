export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTotpFactor, verifyTotpSetup } from '@/lib/twilio'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'

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
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toApiError(err, 'mfa.setup')
  }
}, { skipMfaCheck: true })
