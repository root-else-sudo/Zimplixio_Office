export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'

type Ctx = { params: Promise<{ taskId: string }> }

export const POST = withAuth(
  async (_req: NextRequest, { params }: Ctx) => {
    try {
      const { taskId } = await params
      await prisma.task.delete({ where: { id: taskId } })
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return toApiError(err, 'tasks.reject')
    }
  },
  { role: 'ADMIN' },
)
