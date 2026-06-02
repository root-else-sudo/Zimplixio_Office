import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PostsClient from './PostsClient'

export default async function PostsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const posts = await prisma.post.findMany({
    where: { status: { in: ['DRAFT', 'APPROVED'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      newsletter: true,
      sourceSubject: true,
      sourceDate: true,
      content: true,
      status: true,
      approvedAt: true,
      approvedById: true,
      rejectedAt: true,
      rejectedById: true,
      rejectionReason: true,
    },
  })

  return (
    <PostsClient
      posts={JSON.parse(JSON.stringify(posts))}
      isAdmin={session.user.role === 'ADMIN'}
      approverName={session.user.name ?? null}
    />
  )
}
