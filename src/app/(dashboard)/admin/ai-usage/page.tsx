import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AiUsageClient from './AiUsageClient'

export default async function AiUsagePage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const calls = await prisma.llmCall.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 1_000,
    select: {
      id: true,
      route: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      latencyMs: true,
      costUsd: true,
      success: true,
      errorCode: true,
      createdAt: true,
    },
  })

  // Decimal → number for serialization to client component.
  const serialized = calls.map((c) => ({
    ...c,
    costUsd: c.costUsd ? Number(c.costUsd) : null,
    createdAt: c.createdAt.toISOString(),
  }))

  return <AiUsageClient calls={serialized} />
}
