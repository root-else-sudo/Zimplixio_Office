import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CalendarClient from './CalendarClient'

export default async function CalendarPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const posts = await prisma.post.findMany({
    where: { status: { in: ['DRAFT', 'APPROVED'] } },
    orderBy: { createdAt: 'desc' },
  })

  return <CalendarClient posts={JSON.parse(JSON.stringify(posts))} />
}
