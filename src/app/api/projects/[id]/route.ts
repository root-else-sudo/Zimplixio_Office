export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx) => {
  try {
    const { id } = await ctx.params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' },
              include: { dependencies: { select: { requiredTaskId: true } } },
            },
          },
        },
      },
    })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(project)
  } catch (err) {
    return toApiError(err, 'projects.get')
  }
})

export const PATCH = withAuth(
  async (req: NextRequest, ctx: Ctx) => {
    try {
      const { id } = await ctx.params
      const result = await parseJson(req, PatchSchema)
      if (result instanceof NextResponse) return result
      const project = await prisma.project.update({ where: { id }, data: result.data })
      return NextResponse.json(project)
    } catch (err) {
      return toApiError(err, 'projects.patch')
    }
  },
  { role: 'ADMIN' },
)

export const DELETE = withAuth(
  async (_req: NextRequest, ctx: Ctx) => {
    try {
      const { id } = await ctx.params
      await prisma.project.delete({ where: { id } })
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return toApiError(err, 'projects.delete')
    }
  },
  { role: 'ADMIN' },
)
