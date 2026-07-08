import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { departmentKeyFromSlug } from '@/lib/departments'
import ReservedState from '@/components/departments/ReservedState'
import DepartmentAnatomy from '@/components/departments/DepartmentAnatomy'

export default async function DepartmentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: slug } = await params
  const key = departmentKeyFromSlug(slug)
  if (!key) notFound()

  const department = await prisma.department.findUnique({
    where: { key },
    include: {
      goals: { orderBy: { createdAt: 'asc' } },
      tasks: { orderBy: { createdAt: 'asc' } },
      knowledge: { orderBy: { order: 'asc' } },
      kpis: { orderBy: { order: 'asc' } },
    },
  })
  if (!department) notFound()

  if (department.status === 'RESERVED') {
    return <ReservedState name={department.name} />
  }

  return <DepartmentAnatomy department={department} />
}
