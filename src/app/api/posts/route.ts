export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    include: { run: { include: { agent: true } } },
  })
  return NextResponse.json(posts)
}

export const DELETE = withAuth(
  async () => {
    const { count } = await prisma.post.deleteMany({
      where: { status: { in: ['DRAFT', 'REJECTED'] } },
    })
    return NextResponse.json({ deleted: count })
  },
  { role: 'ADMIN' }
)
