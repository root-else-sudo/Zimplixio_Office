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
  })

  return <PostsClient posts={JSON.parse(JSON.stringify(posts))} />
}
