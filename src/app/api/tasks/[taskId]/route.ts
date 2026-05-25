export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'

const PatchSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'PENDING_APPROVAL']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  blockReason: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ taskId: string }> }

export const PATCH = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { taskId } = await ctx.params
      const result = await parseJson(req, PatchSchema)
      if (result instanceof NextResponse) return result
      const body = result.data

      const data: Record<string, unknown> = { ...body }
      if (body.startDate) data.startDate = new Date(body.startDate)
      if (body.endDate) data.endDate = new Date(body.endDate)

      // Cascade shift all directly-dependent tasks when end date changes
      if (body.endDate) {
        const current = await prisma.task.findUnique({ where: { id: taskId }, select: { endDate: true } })
        if (current) {
          const delta = new Date(body.endDate).getTime() - current.endDate.getTime()
          if (delta !== 0) {
            const deps = await prisma.taskDependency.findMany({
              where: { requiredTaskId: taskId },
              select: { dependentTaskId: true },
            })
            for (const dep of deps) {
              const dt = await prisma.task.findUnique({
                where: { id: dep.dependentTaskId },
                select: { startDate: true, endDate: true },
              })
              if (dt) {
                await prisma.task.update({
                  where: { id: dep.dependentTaskId },
                  data: {
                    startDate: new Date(dt.startDate.getTime() + delta),
                    endDate: new Date(dt.endDate.getTime() + delta),
                  },
                })
              }
            }
          }
        }
      }

      const task = await prisma.task.update({ where: { id: taskId }, data })
      return NextResponse.json(task)
    } catch (err) {
      return toApiError(err, 'tasks.patch')
    }
  },
  { role: 'ADMIN' },
)

export const DELETE = withAuth(
  async (_req: NextRequest, ctx: Ctx) => {
    try {
      const { taskId } = await ctx.params
      await prisma.task.delete({ where: { id: taskId } })
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return toApiError(err, 'tasks.delete')
    }
  },
  { role: 'ADMIN' },
)
