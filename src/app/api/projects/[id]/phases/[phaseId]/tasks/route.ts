export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'

const CreateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  proposedBy: z.string().optional(),
})

type Ctx = { params: Promise<{ id: string; phaseId: string }> }

export const POST = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { phaseId } = await ctx.params
      const result = await parseJson(req, CreateSchema)
      if (result instanceof NextResponse) return result
      const { name, description, startDate, endDate, proposedBy } = result.data

      const maxOrder = await prisma.task.findFirst({
        where: { phaseId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })

      const isPending = !!proposedBy && proposedBy !== 'user'
      const task = await prisma.task.create({
        data: {
          phaseId,
          name,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          proposedBy,
          status: isPending ? 'PENDING_APPROVAL' : 'TODO',
          order: (maxOrder?.order ?? -1) + 1,
        },
      })
      return NextResponse.json(task, { status: 201 })
    } catch (err) {
      return toApiError(err, 'tasks.create')
    }
  },
  { role: 'ADMIN' },
)
