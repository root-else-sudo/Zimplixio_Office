import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import WorkflowTriggerForm from './WorkflowTriggerForm'

export default async function WorkflowPage() {
  const department = await prisma.department.findUnique({ where: { key: 'PRODUCT_RESEARCH' } })

  const runs = department
    ? await prisma.probeRun.findMany({
        where: { departmentId: department.id },
        orderBy: { createdAt: 'desc' },
      })
    : []

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
      <div>
        <p className="eyebrow">Workflow</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          Research Probe
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
          Investigate one named company at a time — every step it takes is kept and shown below, not just a final answer.
        </p>
      </div>

      <WorkflowTriggerForm />

      {runs.length === 0 ? (
        <div className="soft-card px-6 py-10 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>No probe runs yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/departments/product-research/workflow/${run.id}`}
              className="soft-card soft-card-hover px-5 py-4 flex items-center justify-between gap-4"
            >
              <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{run.companyName}</p>
              <span
                className="badge shrink-0"
                style={{
                  background: run.status === 'COMPLETE' ? 'var(--green-50)' : run.status === 'FAILED' ? '#F3F4F6' : 'var(--copper-100)',
                  color: run.status === 'COMPLETE' ? 'var(--green-600)' : run.status === 'FAILED' ? 'var(--gray-600)' : 'var(--copper-500)',
                }}
              >
                {run.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
