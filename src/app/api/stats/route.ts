import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [totalDrafts, totalApproved] = await Promise.all([
    prisma.post.count({ where: { status: 'DRAFT' } }),
    prisma.post.count({ where: { status: 'APPROVED' } }),
  ])

  return NextResponse.json({ totalDrafts, totalApproved })
}
