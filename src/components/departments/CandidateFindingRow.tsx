'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Finding } from '@prisma/client'

export default function CandidateFindingRow({ finding }: { finding: Finding }) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function patch(body: { status: 'VALIDATED' | 'REJECTED'; rejectionReason?: string }) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/findings/${finding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finding.title,
          evidence: finding.evidence,
          fitRationale: finding.fitRationale,
          ...body,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.issues?.[0]?.message ?? data.error ?? 'Failed to save')
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  if (mode === 'rejecting') {
    return (
      <div className="soft-card px-5 py-4 space-y-3">
        <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{finding.title}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Reason for rejecting — feeds the future learning loop"
          className="w-full text-sm rounded-md border px-3 py-2"
          style={{ borderColor: 'var(--border)', color: 'var(--gray-900)' }}
        />
        {error && <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            className="btn-outline"
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => { setMode('idle'); setError(null) }}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn-destructive"
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => patch({ status: 'REJECTED', rejectionReason: reason })}
            disabled={saving}
          >
            {saving ? 'Rejecting…' : 'Confirm reject'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="soft-card px-5 py-4 flex items-center justify-between gap-4">
      <Link
        href={`/departments/product-research/findings/${finding.id}`}
        className="text-sm font-medium hover:underline"
        style={{ color: 'var(--gray-900)' }}
      >
        {finding.title}
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {error && <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>}
        <button
          className="btn-destructive"
          style={{ padding: '6px 14px', fontSize: '13px' }}
          onClick={() => setMode('rejecting')}
          disabled={saving}
        >
          Reject
        </button>
        <button
          className="btn-primary"
          style={{ padding: '6px 14px', fontSize: '13px' }}
          onClick={() => patch({ status: 'VALIDATED' })}
          disabled={saving}
        >
          {saving ? 'Validating…' : 'Validate'}
        </button>
      </div>
    </div>
  )
}
