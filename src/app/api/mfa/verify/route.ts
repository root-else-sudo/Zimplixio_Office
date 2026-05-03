import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyTotpCode } from '@/lib/twilio'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })

  if (!user?.mfaSecret) {
    return NextResponse.json({ error: 'MFA not configured' }, { status: 400 })
  }

  const ok = await verifyTotpCode(session.user.id, user.mfaSecret, code)
  if (!ok) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

  return NextResponse.json({ ok: true })
}
