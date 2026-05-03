import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OpportunitiesClient from './OpportunitiesClient'

export default async function OpportunitiesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const opportunities = await prisma.opportunity.findMany({
    orderBy: { generatedAt: 'desc' },
  })

  return (
    <OpportunitiesClient
      initialOpportunities={JSON.parse(JSON.stringify(opportunities))}
      isAdmin={session.user.role === 'ADMIN'}
    />
  )
}
