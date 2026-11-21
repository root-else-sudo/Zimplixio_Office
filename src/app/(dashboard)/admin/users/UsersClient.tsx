'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import InviteLinkCard from '@/components/admin/InviteLinkCard'
import { formatDateTime } from '@/lib/admin/format'
import { LinkPendingHint } from '@/components/ui/LinkPendingHint'

type CompanyOpt = { id: string; name: string; status: 'ACTIVE' | 'DEACTIVATED' }
type Row = {
  id: string
  name: string
  email: string
  status: 'ACTIVE' | 'INVITED' | 'DEACTIVATED'
  mfaEnabled: boolean
  companyName: string
  pendingInviteExpiresAt: string | null
}

function badge(status: Row['status']) {
  if (status === 'ACTIVE') return 'badge-status-active'
  if (status === 'INVITED') return 'badge-status-pending'
  return 'badge-status-deactivated'
}

function label(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export default function UsersClient({
  users, companies, companyId, inviteOpen,
}: { users: Row[]; companies: CompanyOpt[]; companyId: string | null; inviteOpen: boolean }) {
  const router = useRouter()
  const invitable = companies.filter(c => c.status === 'ACTIVE')
  const [open, setOpen] = useState(inviteOpen)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteCompany, setInviteCompany] = useState(
    companyId && invitable.some(c => c.id === companyId) ? companyId : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ name: string; url: string; expiresAt: string } | null>(null)

  function onFilter(value: string) {
    router.push(value ? `/admin/users?companyId=${encodeURIComponent(value)}` : '/admin/users')
  }

  function close() {
    setOpen(false)
    setName('')
    setEmail('')
    setError(null)
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, companyId: inviteCompany }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not invite the user')
        return
      }
      setIssued({ name: data.user?.name ?? name, url: data.inviteUrl, expiresAt: data.expiresAt })
      close()
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
        <h2 className="admin-section-title">Users</h2>
        {!open && (
          <button type="button" className="btn-primary" onClick={() => { setIssued(null); setOpen(true) }}>
            <UserPlus className="h-4 w-4" /> Invite user
          </button>
        )}
      </div>

      {issued && (
        <InviteLinkCard
          name={issued.name}
          url={issued.url}
          expiresAt={issued.expiresAt}
          onDismiss={() => setIssued(null)}
        />
      )}

      {open && (
        <form className="soft-card admin-card" onSubmit={invite}>
          <div className="admin-form">
            <div className="admin-field">
              <label className="admin-label" htmlFor="invite-name">Name</label>
              <input
                id="invite-name"
                className="admin-input"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Alex Example"
                autoFocus
                required
              />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                type="email"
                className="admin-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="alex@example.com"
                required
              />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="invite-company">Company</label>
              <select
                id="invite-company"
                className="admin-input"
                value={inviteCompany}
                onChange={e => setInviteCompany(e.target.value)}
                required
              >
                <option value="">Select a company…</option>
                {invitable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="admin-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || name.trim() === '' || email.trim() === '' || inviteCompany === ''}
            >
              {busy ? 'Inviting…' : 'Create invite'}
            </button>
            <button type="button" className="btn-outline" onClick={close}>Cancel</button>
          </div>
          {error && <p role="alert" className="admin-error">{error}</p>}
        </form>
      )}

      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label" htmlFor="company-filter">Company</label>
          <select
            id="company-filter"
            className="admin-input"
            value={companyId ?? ''}
            onChange={e => onFilter(e.target.value)}
          >
            <option value="">All companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="soft-card admin-table-wrap">
        {users.length === 0 ? (
          <p className="admin-empty">No users to show.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Status</th>
                <th>MFA</th>
                <th>Invite</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><Link href={`/admin/users/${u.id}`} className="admin-table-link">{u.name}<LinkPendingHint /></Link></td>
                  <td>{u.email}</td>
                  <td>{u.companyName}</td>
                  <td><span className={`badge ${badge(u.status)}`}>{label(u.status)}</span></td>
                  <td>{u.mfaEnabled ? 'Enrolled' : 'Not yet'}</td>
                  <td className="admin-muted">
                    {u.pendingInviteExpiresAt
                      ? `Expires ${formatDateTime(u.pendingInviteExpiresAt)}`
                      : u.status === 'INVITED' ? 'Expired' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
