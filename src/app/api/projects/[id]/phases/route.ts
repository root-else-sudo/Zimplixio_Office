import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export const POST = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { id: projectId } = await ctx.params
      const result = await parseJson(req, CreateSchema)
      if (result instanceof NextResponse) return result

      const maxOrder = await prisma.phase.findFirst({
        where: { projectId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })

      const phase = await prisma.phase.create({
        data: { ...result.data, projectId, order: (maxOrder?.order ?? -1) + 1 },
      })
      return NextResponse.json(phase, { status: 201 })
    } catch (err) {
      return toApiError(err, 'phases.create')
    }
  },
  { role: 'ADMIN' },
)
