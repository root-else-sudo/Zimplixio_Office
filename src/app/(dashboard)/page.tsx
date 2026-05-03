import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OverviewClient from './OverviewClient'

export default async function OverviewPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  const [totalDrafts, totalApproved, allRuns, agents] = await Promise.all([
    prisma.post.count({ where: { status: 'DRAFT' } }),
    prisma.post.count({ where: { status: 'APPROVED' } }),
    // All runs in last 4 weeks for charts
    prisma.pipelineRun.findMany({
      where: { startedAt: { gte: fourWeeksAgo } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, status: true, _count: { select: { posts: true } } },
    }),
    prisma.agent.findMany({
      orderBy: { name: 'asc' },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 8,
          select: {
            id: true, status: true, startedAt: true, finishedAt: true,
            _count: { select: { posts: true } },
          },
        },
      },
    }),
  ])

  type RunSummary = { startedAt: Date; status: string; _count: { posts: number } }

  // Build weekly chart data (last 4 weeks)
  const weeks = [0, 1, 2, 3].map(i => {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - (3 - i) * 7 - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const weekRuns = allRuns.filter((r: RunSummary) => {
      const d = new Date(r.startedAt)
      return d >= weekStart && d < weekEnd
    })

    return {
      week: label,
      posts: weekRuns.reduce((sum: number, r: RunSummary) => sum + r._count.posts, 0),
      success: weekRuns.filter((r: RunSummary) => r.status === 'SUCCESS').length,
      failed: weekRuns.filter((r: RunSummary) => r.status === 'FAILED').length,
    }
  })

  // Week's run count and success rate
  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - 7)
  const thisWeekRuns = allRuns.filter((r: RunSummary) => new Date(r.startedAt) >= thisWeekStart)
  const successRate = thisWeekRuns.length > 0
    ? Math.round((thisWeekRuns.filter((r: RunSummary) => r.status === 'SUCCESS').length / thisWeekRuns.length) * 100)
    : 0

  return (
    <OverviewClient
      stats={{ totalDrafts, totalApproved }}
      agents={JSON.parse(JSON.stringify(agents))}
      chartData={weeks}
      weeklyRunCount={thisWeekRuns.length}
      successRate={successRate}
      isAdmin={session.user.role === 'ADMIN'}
    />
  )
}
