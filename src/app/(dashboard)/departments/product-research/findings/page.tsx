import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { FINDING_STATUS_STYLES } from '@/lib/findings'
import RunResearchButton from '@/components/departments/RunResearchButton'

export default async function FindingsPage() {
  const department = await prisma.department.findUnique({
    where: { key: 'PRODUCT_RESEARCH' },
  })

  const findings = department
    ? await prisma.finding.findMany({
        where: { departmentId: department.id },
        orderBy: { createdAt: 'desc' },
      })
    : []

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Findings</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
            Candidate service opportunities
          </h1>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          <RunResearchButton />
          <Link href="/departments/product-research/findings/new" className="btn-primary">
            New Finding
          </Link>
        </div>
      </div>

      {findings.length === 0 ? (
        <div className="soft-card px-6 py-10 text-center space-y-3">
          <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>No Findings yet</p>
          <p className="text-sm" style={{ color: 'var(--gray-600)' }}>
            Record one by hand, or wait for the Research Engine to start surfacing candidates.
          </p>
          <Link href="/departments/product-research/findings/new" className="btn-primary inline-flex">
            New Finding
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {findings.map((finding) => {
            const style = FINDING_STATUS_STYLES[finding.status]
            return (
              <Link
                key={finding.id}
                href={`/departments/product-research/findings/${finding.id}`}
                className="soft-card soft-card-hover px-5 py-4 flex items-center justify-between gap-4"
              >
                <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{finding.title}</p>
                <span className="badge shrink-0" style={{ background: style.bg, color: style.color }}>
                  {style.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
