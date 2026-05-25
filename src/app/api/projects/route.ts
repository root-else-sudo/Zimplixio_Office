import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { parseJson } from '@/lib/validate'
import type { AuthedSession } from '@/lib/rbac'

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export const GET = withAuth(async () => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: { tasks: { select: { id: true, status: true } } },
        },
      },
    })
    return NextResponse.json(projects)
  } catch (err) {
    return toApiError(err, 'projects.list')
  }
})

export const POST = withAuth(
  async (req: NextRequest, _ctx: object, session: AuthedSession) => {
    try {
      const result = await parseJson(req, CreateSchema)
      if (result instanceof NextResponse) return result
      const project = await prisma.project.create({
        data: { ...result.data, createdById: session.user.id },
      })
      return NextResponse.json(project, { status: 201 })
    } catch (err) {
      return toApiError(err, 'projects.create')
    }
  },
  { role: 'ADMIN' },
)
