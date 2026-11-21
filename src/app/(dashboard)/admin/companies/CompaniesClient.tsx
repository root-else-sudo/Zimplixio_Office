'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

type Row = {
  id: string
  name: string
  kind: 'INTERNAL' | 'CLIENT'
  status: 'ACTIVE' | 'DEACTIVATED'
  userCount: number
  createdAt: string
}

export default function CompaniesClient({ companies }: { companies: Row[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not create the company')
        return
      }
      setName('')
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="admin-toolbar">
        <h2 className="admin-section-title">Companies</h2>
        {!open && (
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New company
          </button>
        )}
      </div>

      {open && (
        <form className="soft-card admin-card" onSubmit={create}>
          <div className="admin-form">
            <div className="admin-field">
              <label className="admin-label" htmlFor="company-name">Company name</label>
              <input
                id="company-name"
                className="admin-input"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Example Co"
                autoFocus
                required
              />
            </div>
            <div className="admin-actions">
              <button type="submit" className="btn-primary" disabled={busy || name.trim() === ''}>
                {busy ? 'Creating…' : 'Create company'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => { setOpen(false); setName(''); setError(null) }}
              >
                Cancel
              </button>
            </div>
          </div>
          {error && <p role="alert" className="admin-error">{error}</p>}
        </form>
      )}

      <div className="soft-card admin-table-wrap">
        {companies.length === 0 ? (
          <p className="admin-empty">No companies yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/companies/${c.id}`} className="admin-table-link">{c.name}</Link>
                  </td>
                  <td>
                    <span className={`badge ${c.kind === 'INTERNAL' ? 'badge-kind-internal' : 'badge-kind-client'}`}>
                      {c.kind === 'INTERNAL' ? 'Internal' : 'Client'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${c.status === 'ACTIVE' ? 'badge-status-active' : 'badge-status-deactivated'}`}>
                      {c.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td>{c.userCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
