import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DepartmentAnatomy from '@/components/departments/DepartmentAnatomy'

export default async function ProductResearchOverviewPage() {
  const department = await prisma.department.findUnique({
    where: { key: 'PRODUCT_RESEARCH' },
    include: {
      goals: { orderBy: { createdAt: 'asc' } },
      tasks: { orderBy: { createdAt: 'asc' } },
      knowledge: { orderBy: { order: 'asc' } },
      kpis: { orderBy: { order: 'asc' } },
    },
  })
  if (!department) notFound()

  return <DepartmentAnatomy department={department} />
}
