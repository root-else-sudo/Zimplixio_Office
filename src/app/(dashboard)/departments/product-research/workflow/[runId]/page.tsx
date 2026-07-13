import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

const CONFIDENCE_STYLE: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: 'var(--green-50)', color: 'var(--green-600)' },
  MEDIUM: { bg: 'var(--copper-100)', color: 'var(--copper-500)' },
  LOW: { bg: '#F3F4F6', color: 'var(--gray-600)' },
}

export default async function WorkflowRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const run = await prisma.probeRun.findUnique({
    where: { id: runId },
    include: {
      signalItems: { orderBy: { createdAt: 'asc' } },
      hypotheses: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!run) notFound()

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
      <div>
        <p className="eyebrow">Workflow / {run.companyName}</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          {run.companyName}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
          Status: {run.status}
          {run.errorMessage ? ` — ${run.errorMessage}` : ''}
          {run.costUsd != null ? ` · $${run.costUsd.toFixed(4)}` : ''}
        </p>
      </div>

      <section className="space-y-3">
        <p className="eyebrow">Signal gathered ({run.signalItems.length})</p>
        {run.signalItems.map((item) => (
          <div key={item.id} className="soft-card px-5 py-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--copper-500)' }}>
              {item.source}
              {item.title ? ` — ${item.title}` : ''}
            </p>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" className="text-xs underline break-all" style={{ color: 'var(--gray-600)' }}>
                {item.url}
              </a>
            )}
            <p className="text-sm" style={{ color: 'var(--gray-900)' }}>{item.content}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Hypotheses ({run.hypotheses.length})</p>
        {run.hypotheses.length === 0 && (
          <div className="soft-card px-6 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--gray-600)' }}>No hypotheses were proposed for this run.</p>
          </div>
        )}
        {run.hypotheses.map((h) => (
          <div key={h.id} className="soft-card px-5 py-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{h.title ?? h.need}</p>
              {h.confidence && (
                <span
                  className="badge shrink-0"
                  style={{ background: CONFIDENCE_STYLE[h.confidence].bg, color: CONFIDENCE_STYLE[h.confidence].color }}
                >
                  {h.confidence}
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--gray-600)' }}>
              Need: {h.need} → Proposed: {h.proposedService}
            </p>
            {h.evidence && (
              <p className="text-sm" style={{ color: 'var(--gray-900)' }}>{h.evidence}</p>
            )}
            {h.fitRationale && (
              <p className="text-xs" style={{ color: 'var(--gray-600)' }}>Fit: {h.fitRationale}</p>
            )}
            {h.disconfirmingEvidence && (
              <p className="text-xs" style={{ color: 'var(--error)' }}>Disconfirming: {h.disconfirmingEvidence}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
