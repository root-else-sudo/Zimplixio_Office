import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

// Lands the owner on the first built department. Revisit once there's a
// dedicated company-wide overview (Operations' supervisor seat, later).
export default async function RootPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const firstBuilt = await prisma.department.findFirst({
    where: { status: 'BUILT' },
    orderBy: { order: 'asc' },
  })

  redirect(`/departments/${firstBuilt ? firstBuilt.key.toLowerCase().replace(/_/g, '-') : ''}`)
}
