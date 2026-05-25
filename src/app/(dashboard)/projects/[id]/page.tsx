import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import ProjectDetailClient from './ProjectDetailClient'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      phases: {
        orderBy: { order: 'asc' },
        include: {
          tasks: {
            orderBy: { order: 'asc' },
            include: { dependencies: { select: { requiredTaskId: true } } },
          },
        },
      },
    },
  })

  if (!project) notFound()

  return (
    <ProjectDetailClient
      project={JSON.parse(JSON.stringify(project))}
      isAdmin={session.user.role === 'ADMIN'}
    />
  )
}
