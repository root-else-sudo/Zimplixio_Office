'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WorkflowTriggerForm() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [urlsText, setUrlsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const urls = urlsText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)

    try {
      const res = await fetch('/api/research-probe/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          manualNotes: manualNotes.trim() || undefined,
          urls: urls.length > 0 ? urls : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start run')
      router.push(`/departments/product-research/workflow/${data.runId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start run')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="soft-card p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--gray-900)' }}>
          Company name
        </label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          placeholder="e.g. Hillpointe"
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--gray-900)' }}>
          Manual notes (optional)
        </label>
        <textarea
          value={manualNotes}
          onChange={(e) => setManualNotes(e.target.value)}
          rows={4}
          placeholder="Anything you've personally observed about this company..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--gray-900)' }}>
          URLs to fetch directly (optional, one per line)
        </label>
        <p className="text-xs mb-1.5" style={{ color: 'var(--gray-600)' }}>
          Direct listing pages (e.g. a specific job posting) extract better than search-results pages (e.g. Indeed&apos;s job search).
        </p>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={2}
          placeholder="https://..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
        />
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Running…' : 'Run probe'}
      </button>
    </form>
  )
}
