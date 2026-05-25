import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().min(0).optional(),
})

type Ctx = { params: Promise<{ id: string; phaseId: string }> }

export const PATCH = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { phaseId } = await ctx.params
      const result = await parseJson(req, PatchSchema)
      if (result instanceof NextResponse) return result
      const phase = await prisma.phase.update({ where: { id: phaseId }, data: result.data })
      return NextResponse.json(phase)
    } catch (err) {
      return toApiError(err, 'phases.patch')
    }
  },
  { role: 'ADMIN' },
)

export const DELETE = withAuth(
  async (_req: NextRequest, ctx: Ctx) => {
    try {
      const { phaseId } = await ctx.params
      await prisma.phase.delete({ where: { id: phaseId } })
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return toApiError(err, 'phases.delete')
    }
  },
  { role: 'ADMIN' },
)
