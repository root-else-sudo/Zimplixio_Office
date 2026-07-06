import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { departmentKeyFromSlug } from '@/lib/departments'
import ReservedState from '@/components/departments/ReservedState'

function EmptySection({ label, guidance }: { label: string; guidance: string }) {
  return (
    <div className="soft-card px-6 py-8 text-center">
      <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{label}</p>
      <p className="mt-1 text-sm" style={{ color: 'var(--gray-600)' }}>{guidance}</p>
    </div>
  )
}

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

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
      <div>
        <p className="eyebrow">Department</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          {department.name}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>{department.purpose}</p>
      </div>

      <section>
        <p className="eyebrow">Goals</p>
        {department.goals.length === 0 ? (
          <EmptySection label="No goals yet" guidance="Goals this department is pursuing will show up here." />
        ) : (
          <div className="space-y-2">
            {department.goals.map((goal) => (
              <div key={goal.id} className="soft-card px-5 py-4">
                <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{goal.title}</p>
                {goal.description && (
                  <p className="mt-1 text-sm" style={{ color: 'var(--gray-600)' }}>{goal.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow">Tasks</p>
        {department.tasks.length === 0 ? (
          <EmptySection label="No tasks yet" guidance="Concrete work laddering up to this department's goals will show up here." />
        ) : (
          <div className="space-y-2">
            {department.tasks.map((task) => (
              <div key={task.id} className="soft-card px-5 py-4 flex items-center justify-between gap-4">
                <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{task.title}</p>
                <span className="badge" style={{ background: 'var(--green-50)', color: 'var(--green-600)' }}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow">Knowledge</p>
        <div className="soft-card px-6 py-6 space-y-3">
          {department.knowledge.map((entry) => (
            <p key={entry.id} className="text-sm leading-relaxed" style={{ color: 'var(--gray-900)' }}>
              {entry.content}
            </p>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">KPIs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {department.kpis.map((kpi) => (
            <div key={kpi.id} className="stat-chip">
              <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{kpi.name}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
