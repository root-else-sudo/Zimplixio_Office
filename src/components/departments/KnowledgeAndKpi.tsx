import type { Knowledge, Kpi } from '@prisma/client'

export default function KnowledgeAndKpi({ knowledge, kpis }: { knowledge: Knowledge[]; kpis: Kpi[] }) {
  return (
    <>
      <section>
        <p className="eyebrow">Knowledge</p>
        <div className="soft-card px-6 py-6 space-y-3">
          {knowledge.map((entry) => (
            <p key={entry.id} className="text-sm leading-relaxed" style={{ color: 'var(--gray-900)' }}>
              {entry.content}
            </p>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">KPIs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.id} className="stat-chip">
              <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{kpi.name}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
