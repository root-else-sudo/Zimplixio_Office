import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import HistoryClient, { type HistoryVersion } from './HistoryClient'

export default async function PostHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      newsletter: true,
      sourceSubject: true,
      status: true,
      createdAt: true,
      approvedAt: true,
      approvedById: true,
      rejectedAt: true,
      rejectedById: true,
      rejectionReason: true,
    },
  })
  if (!post) notFound()

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

  const serialized: HistoryVersion[] = versions.map((v) => ({
    id: v.id,
    version: v.version,
    content: v.content,
    source: v.source,
    feedback: v.feedback as Record<string, unknown> | null,
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
  }))

  return (
    <HistoryClient
      post={{
        id: post.id,
        newsletter: post.newsletter,
        sourceSubject: post.sourceSubject,
        status: post.status,
        createdAt: post.createdAt.toISOString(),
        approvedAt: post.approvedAt?.toISOString() ?? null,
        approvedById: post.approvedById,
        rejectedAt: post.rejectedAt?.toISOString() ?? null,
        rejectedById: post.rejectedById,
        rejectionReason: post.rejectionReason,
      }}
      versions={serialized}
    />
  )
}
