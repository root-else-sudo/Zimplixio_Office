import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { _count: { select: { posts: true } } },
  })

  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    status: run.status,
    postCount: run._count.posts,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    log: run.log ?? '',
  })
}
