import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PipelineFlow from '@/components/PipelineFlow'

export default async function AgentsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const [recentRuns, lastRun] = await Promise.all([
    prisma.pipelineRun.findMany({
      take: 8,
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, startedAt: true },
    }),
    prisma.pipelineRun.findFirst({
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, log: true, startedAt: true, finishedAt: true },
    }),
  ])

  return (
    <div className="p-7 md:p-10 max-w-6xl mx-auto space-y-7">
      <div>
        <p className="eyebrow">Marketing</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
          Pipeline Flow
        </h1>
      </div>

      <PipelineFlow
        overallStatus={lastRun?.status ?? ''}
        log={lastRun?.log ?? ''}
        startedAt={lastRun?.startedAt ? JSON.parse(JSON.stringify(lastRun.startedAt)) : null}
        finishedAt={lastRun?.finishedAt ? JSON.parse(JSON.stringify(lastRun.finishedAt)) : null}
        recentRuns={JSON.parse(JSON.stringify(recentRuns))}
        currentRunId={lastRun?.id ?? null}
      />
    </div>
  )
}
