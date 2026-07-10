export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteTotpFactor } from '@/lib/twilio'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'

export const POST = withAuth(async (_req, _ctx, session) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } })

    if (user?.mfaSecret) {
      await deleteTotpFactor(session.user.id, user.mfaSecret)
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { mfaEnabled: false, mfaSecret: null },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toApiError(err, 'mfa.disable')
  }
})
