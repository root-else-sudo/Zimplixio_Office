export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { apiError, toApiError } from '@/lib/errors'

export const GET = withAuth<{ id: string }>(async (_req, { params }) => {
  const { id } = await params
  try {
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!post) return apiError('NOT_FOUND', 'Post not found')

    const versions = await prisma.postVersion.findMany({
      where: { postId: id },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        content: true,
        source: true,
        feedback: true,
        createdBy: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ versions })
  } catch (err) {
    return toApiError(err, 'posts.versions')
  }
})
