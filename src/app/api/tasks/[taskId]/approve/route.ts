export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import type { AuthedSession } from '@/lib/rbac'

type Ctx = { params: Promise<{ taskId: string }> }

export const POST = withAuth(
  async (_req: NextRequest, ctx: Ctx, session: AuthedSession) => {
    try {
      const { taskId } = await ctx.params
      const task = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'TODO',
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      })
      return NextResponse.json(task)
    } catch (err) {
      return toApiError(err, 'tasks.approve')
    }
  },
  { role: 'ADMIN' },
)
