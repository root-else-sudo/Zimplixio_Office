export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params

  let run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { _count: { select: { posts: true } } },
  })

  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Auto-recover runs that are stuck in RUNNING for more than 30 minutes.
  if (run.status === 'RUNNING') {
    const ageMs = Date.now() - new Date(run.startedAt).getTime()
    if (ageMs > 30 * 60 * 1000) {
      run = await prisma.pipelineRun.update({
        where: { id: runId },
        data: { status: 'FAILED', finishedAt: new Date() },
        include: { _count: { select: { posts: true } } },
      })
    }
  }

  // run.log is deprecated since Phase 4 — the worker now writes structured
  // PipelineEvent records. Build a synthetic log from events so PipelineFlow
  // can determine per-step status during and after a run.
  let log = run.log ?? ''
  if (!log) {
    const events = await prisma.pipelineEvent.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    })
    const parts: string[] = []
    for (const e of events) {
      if (e.eventType === 'started' && e.stepName.startsWith('execution/')) {
        const marker = e.stepName.replace('execution/', '').replace('.py', '')
        parts.push(`[${marker}]`)
      } else if (e.eventType === 'stdout' || e.eventType === 'stderr') {
        const payload = e.payload as { line?: string }
        if (payload?.line) parts.push(payload.line)
      }
    }
    log = parts.join('\n')
  }

  return NextResponse.json({
    status: run.status,
    postCount: run._count.posts,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    log,
  })
}
