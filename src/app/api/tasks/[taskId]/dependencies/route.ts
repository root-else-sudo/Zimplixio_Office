import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'

const Schema = z.object({ requiredTaskId: z.string().min(1) })

type Ctx = { params: Promise<{ taskId: string }> }

export const POST = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { taskId: dependentTaskId } = await ctx.params
      const result = await parseJson(req, Schema)
      if (result instanceof NextResponse) return result
      const dep = await prisma.taskDependency.create({
        data: { dependentTaskId, requiredTaskId: result.data.requiredTaskId },
      })
      return NextResponse.json(dep, { status: 201 })
    } catch (err) {
      return toApiError(err, 'tasks.dep.create')
    }
  },
  { role: 'ADMIN' },
)

export const DELETE = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { taskId: dependentTaskId } = await ctx.params
      const result = await parseJson(req, Schema)
      if (result instanceof NextResponse) return result
      await prisma.taskDependency.delete({
        where: {
          dependentTaskId_requiredTaskId: {
            dependentTaskId,
            requiredTaskId: result.data.requiredTaskId,
          },
        },
      })
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return toApiError(err, 'tasks.dep.delete')
    }
  },
  { role: 'ADMIN' },
)
