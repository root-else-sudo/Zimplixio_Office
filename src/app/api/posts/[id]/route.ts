import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishToLinkedIn } from '@/lib/linkedin'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'

const PatchSchema = z
  .object({
    status: z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHED']).optional(),
    content: z.string().min(1).max(10_000).optional(),
  })
  .refine((v) => v.status !== undefined || v.content !== undefined, {
    message: 'At least one of status or content is required',
  })

export const PATCH = withAuth<{ id: string }>(
  async (req: NextRequest, { params }) => {
    const parsed = await parseJson(req, PatchSchema)
    if (parsed instanceof NextResponse) return parsed
    const { status, content } = parsed.data

    const { id } = await params

    try {
      const post = await prisma.post.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(content !== undefined && { content }),
        },
      })

      if (status === 'APPROVED') {
        publishToLinkedIn(post.content).catch((err) =>
          console.error('[posts.publish]', err)
        )
      }

      return NextResponse.json(post)
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        return apiError('NOT_FOUND', 'Post not found')
      }
      return toApiError(err, 'posts.patch')
    }
  },
  { role: 'ADMIN' }
)

export const DELETE = withAuth<{ id: string }>(
  async (_req, { params }) => {
    const { id } = await params
    try {
      await prisma.post.delete({ where: { id } })
      return NextResponse.json({ ok: true })
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        return apiError('NOT_FOUND', 'Post not found')
      }
      return toApiError(err, 'posts.delete')
    }
  },
  { role: 'ADMIN' }
)
