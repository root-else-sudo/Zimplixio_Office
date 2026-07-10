'use client'

import { useState } from 'react'

export default function CompanyProfileClient({ initialContent }: { initialContent: string }) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/company-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save')
      }
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Company Profile</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
            The agent&apos;s fit lens
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
            What Zimplixio can credibly offer as a service. A discovered need only becomes a valid Finding if this shows Zimplixio can serve it.
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
      )}
      {savedAt && !error && (
        <p className="text-sm" style={{ color: 'var(--success)' }}>Saved.</p>
      )}

      <div className="soft-card p-6">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          className="w-full resize-y focus:outline-none focus:ring-2 focus:ring-[var(--green-600)] rounded-md"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '17px',
            lineHeight: 1.7,
            color: 'var(--gray-900)',
          }}
        />
      </div>
    </div>
  )
}
