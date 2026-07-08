'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type FindingStatus = 'CANDIDATE' | 'VALIDATED' | 'REJECTED'

export type FindingFormValues = {
  title: string
  evidence: string
  fitRationale: string
  status: FindingStatus
  rejectionReason: string
}

const EMPTY: FindingFormValues = {
  title: '',
  evidence: '',
  fitRationale: '',
  status: 'CANDIDATE',
  rejectionReason: '',
}

export default function FindingForm({
  findingId,
  initialValues,
}: {
  findingId?: string
  initialValues?: FindingFormValues
}) {
  const router = useRouter()
  const [values, setValues] = useState<FindingFormValues>(initialValues ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof FindingFormValues>(key: K, value: FindingFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const url = findingId ? `/api/findings/${findingId}` : '/api/findings'
    const method = findingId ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.issues?.[0]?.message ?? data.error ?? 'Failed to save')
      }
      router.push('/departments/product-research/findings')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-8 py-10 space-y-5">
      <div>
        <p className="eyebrow">{findingId ? 'Edit Finding' : 'New Finding'}</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          {findingId ? 'Edit Finding' : 'Record a Finding'}
        </h1>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}

      <Field label="Title" hint="The need/niche and the service that would address it.">
        <input
          type="text"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          required
          className="input"
          placeholder="e.g. Data-migration rescue services for law firms"
        />
      </Field>

      <Field label="Evidence" hint="The dots across sources that support it.">
        <textarea
          value={values.evidence}
          onChange={(e) => set('evidence', e.target.value)}
          required
          rows={4}
          className="input"
        />
      </Field>

      <Field label="Fit rationale" hint="Ties the need to a specific Zimplixio capability. Required.">
        <textarea
          value={values.fitRationale}
          onChange={(e) => set('fitRationale', e.target.value)}
          required
          rows={3}
          className="input"
        />
      </Field>

      <Field label="Status">
        <select
          value={values.status}
          onChange={(e) => set('status', e.target.value as FindingStatus)}
          className="input"
        >
          <option value="CANDIDATE">Candidate</option>
          <option value="VALIDATED">Validated</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </Field>

      {values.status === 'REJECTED' && (
        <Field label="Rejection reason" hint="Required when rejecting — feeds the future learning loop.">
          <textarea
            value={values.rejectionReason}
            onChange={(e) => set('rejectionReason', e.target.value)}
            required
            rows={2}
            className="input"
          />
        </Field>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => router.push('/departments/product-research/findings')}
        >
          Cancel
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: var(--font-body);
          font-size: 15px;
          color: var(--gray-900);
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--green-600);
        }
      `}</style>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{label}</span>
      {children}
      {hint && <span className="block text-xs" style={{ color: 'var(--gray-400)' }}>{hint}</span>}
    </label>
  )
}
