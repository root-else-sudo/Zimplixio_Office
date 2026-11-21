'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { LinkPendingHint } from '@/components/ui/LinkPendingHint'

type Company = {
  id: string
  name: string
  kind: 'INTERNAL' | 'CLIENT'
  status: 'ACTIVE' | 'DEACTIVATED'
  userCount: number
  createdAt: string
  users: { id: string; name: string; email: string; status: string; mfaEnabled: boolean }[]
}

function userBadge(status: string) {
  if (status === 'ACTIVE') return 'badge-status-active'
  if (status === 'INVITED') return 'badge-status-pending'
  return 'badge-status-deactivated'
}

function label(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export default function CompanyDetailClient({ company }: { company: Company }) {
  const router = useRouter()
  const [name, setName] = useState(company.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (confirming) confirmRef.current?.focus() }, [confirming])

  const internal = company.kind === 'INTERNAL'
  const active = company.status === 'ACTIVE'

  async function patch(body: { name: string } | { status: 'ACTIVE' | 'DEACTIVATED' }) {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not save the change')
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/companies" className="admin-back inline-flex items-center gap-1.5">
        <ArrowLeft className="h-4 w-4" /> All companies<LinkPendingHint />
      </Link>

      <div className="soft-card admin-card">
        <div className="admin-toolbar">
          <h2 className="admin-section-title">{company.name}</h2>
          <div className="flex items-center gap-2">
            <span className={`badge ${internal ? 'badge-kind-internal' : 'badge-kind-client'}`}>
              {internal ? 'Internal' : 'Client'}
            </span>
            <span className={`badge ${active ? 'badge-status-active' : 'badge-status-deactivated'}`}>
              {active ? 'Active' : 'Deactivated'}
            </span>
          </div>
        </div>

        <form
          className="admin-form"
          onSubmit={e => { e.preventDefault(); void patch({ name }) }}
        >
          <div className="admin-field">
            <label className="admin-label" htmlFor="company-rename">Company name</label>
            <input
              id="company-rename"
              className="admin-input"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || name.trim() === '' || name.trim() === company.name}
          >
            Save name
          </button>
        </form>

        {!internal && (
          <div className="admin-actions">
            {!confirming && active && (
              <button type="button" className="btn-destructive" disabled={busy} onClick={() => setConfirming(true)}>
                Deactivate company
              </button>
            )}
            {!active && (
              <button type="button" className="btn-outline" disabled={busy} onClick={() => void patch({ status: 'ACTIVE' })}>
                Reactivate company
              </button>
            )}
            {confirming && (
              <div className="admin-confirm" role="alertdialog" aria-label="Confirm deactivation">
                <span>Deactivating signs out every user in this company. Continue?</span>
                <button ref={confirmRef} type="button" className="btn-destructive" disabled={busy} onClick={() => void patch({ status: 'DEACTIVATED' })}>
                  {busy ? 'Deactivating…' : 'Yes, deactivate'}
                </button>
                <button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="admin-error">{error}</p>}
      </div>

      <div className="space-y-4">
        <div className="admin-toolbar">
          <h2 className="admin-section-title">Members ({company.users.length})</h2>
          <Link
            href={`/admin/users?companyId=${encodeURIComponent(company.id)}&invite=1`}
            className="btn-outline"
          >
            <UserPlus className="h-4 w-4" /> Invite user to this company
          </Link>
        </div>

        <div className="soft-card admin-table-wrap">
          {company.users.length === 0 ? (
            <p className="admin-empty">No members yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>MFA</th>
                </tr>
              </thead>
              <tbody>
                {company.users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/users/${u.id}`} className="admin-table-link">{u.name}<LinkPendingHint /></Link>
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${userBadge(u.status)}`}>{label(u.status)}</span></td>
                    <td>{u.mfaEnabled ? 'On' : 'Off'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
