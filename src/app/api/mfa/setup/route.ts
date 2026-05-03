import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTotpFactor, verifyTotpSetup } from '@/lib/twilio'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const userId = session.user.id

  // Step 1: create factor — returns binding uri for QR code
  if (body.action === 'create') {
    const factor = await createTotpFactor(userId, session.user.name ?? session.user.email!)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: factor.sid },
    })
    return NextResponse.json({
      factorSid: factor.sid,
      bindingUri: (factor.binding as any)?.uri,
    })
  }

  // Step 2: confirm with first code from authenticator app
  if (body.action === 'verify') {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.mfaSecret) return NextResponse.json({ error: 'No factor found' }, { status: 400 })

    const ok = await verifyTotpSetup(userId, user.mfaSecret, body.code)
    if (!ok) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
