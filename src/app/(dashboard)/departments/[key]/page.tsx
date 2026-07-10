import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { departmentKeyFromSlug } from '@/lib/departments'
import ReservedState from '@/components/departments/ReservedState'
import DepartmentAnatomy from '@/components/departments/DepartmentAnatomy'
import KnowledgeAndKpi from '@/components/departments/KnowledgeAndKpi'

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
    return (
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        <ReservedState name={department.name} />
        <KnowledgeAndKpi knowledge={department.knowledge} kpis={department.kpis} />
      </div>
    )
  }

  return <DepartmentAnatomy department={department} />
}
