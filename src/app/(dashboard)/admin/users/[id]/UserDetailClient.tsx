'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
import InviteLinkCard from '@/components/admin/InviteLinkCard'
import { formatDateTime } from '@/lib/admin/format'
import { LinkPendingHint } from '@/components/ui/LinkPendingHint'

type User = {
  id: string
  name: string
  email: string
  status: 'ACTIVE' | 'INVITED' | 'DEACTIVATED'
  mfaEnabled: boolean
  companyId: string
  companyName: string
  createdAt: string
  pendingInviteExpiresAt: string | null
}

function badge(status: User['status']) {
  if (status === 'ACTIVE') return 'badge-status-active'
  if (status === 'INVITED') return 'badge-status-pending'
  return 'badge-status-deactivated'
}

export default function UserDetailClient({ user, isSelf }: { user: User; isSelf: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(user.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<'deactivate' | 'mfa' | null>(null)
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null)

  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (confirming) confirmRef.current?.focus() }, [confirming])

  const deactivated = user.status === 'DEACTIVATED'

  async function call(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not complete that action')
        return null
      }
      return data
    } catch {
      setError('Network error — please try again')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function patch(body: { name: string } | { status: 'ACTIVE' | 'DEACTIVATED' }) {
    const ok = await call('', { method: 'PATCH', body: JSON.stringify(body) })
    if (ok) { setConfirming(null); router.refresh() }
  }

  async function resetMfa() {
    const ok = await call('/reset-mfa', { method: 'POST' })
    if (ok) { setConfirming(null); router.refresh() }
  }

  async function reissue() {
    const data = await call('/invite', { method: 'POST' })
    if (data && typeof data.inviteUrl === 'string' && typeof data.expiresAt === 'string') {
      setIssued({ url: data.inviteUrl, expiresAt: data.expiresAt })
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="admin-back inline-flex items-center gap-1.5">
        <ArrowLeft className="h-4 w-4" /> All users<LinkPendingHint />
      </Link>

      {issued && (
        <InviteLinkCard
          name={user.name}
          url={issued.url}
          expiresAt={issued.expiresAt}
          onDismiss={() => setIssued(null)}
        />
      )}

      <div className="soft-card admin-card">
        <div className="admin-toolbar">
          <div>
            <h2 className="admin-section-title">{user.name}</h2>
            <p className="admin-note">
              {user.email} ·{' '}
              <Link href={`/admin/companies/${user.companyId}`} className="admin-table-link">{user.companyName}<LinkPendingHint /></Link>
            </p>
          </div>
          <span className={`badge ${badge(user.status)}`}>
            {user.status.charAt(0) + user.status.slice(1).toLowerCase()}
          </span>
        </div>

        <p className="admin-note">
          MFA: {user.mfaEnabled ? 'Enrolled' : 'Not yet'}
          {user.pendingInviteExpiresAt && ` · Invite expires ${formatDateTime(user.pendingInviteExpiresAt)}`}
          {` · Created ${formatDateTime(user.createdAt)}`}
        </p>

        <form
          className="admin-form"
          onSubmit={e => { e.preventDefault(); void patch({ name }) }}
        >
          <div className="admin-field">
            <label className="admin-label" htmlFor="user-rename">Name</label>
            <input
              id="user-rename"
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
            disabled={busy || name.trim() === '' || name.trim() === user.name}
          >
            Save name
          </button>
        </form>

        {isSelf ? (
          <p className="admin-note">This is your account.</p>
        ) : (
          <div className="admin-actions">
            {user.status === 'INVITED' && (
              <button type="button" className="btn-outline" disabled={busy} onClick={() => void reissue()}>
                <KeyRound className="h-4 w-4" /> Reissue invite
              </button>
            )}
            {deactivated ? (
              <button type="button" className="btn-outline" disabled={busy} onClick={() => void patch({ status: 'ACTIVE' })}>
                Reactivate
              </button>
            ) : (
              !confirming && (
                <>
                  <button type="button" className="btn-destructive" disabled={busy} onClick={() => setConfirming('deactivate')}>
                    Deactivate
                  </button>
                  <button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming('mfa')}>
                    Reset MFA
                  </button>
                </>
              )
            )}
            {confirming === 'deactivate' && (
              <div className="admin-confirm" role="alertdialog" aria-label="Confirm deactivation">
                <span>Deactivating signs this user out immediately. Continue?</span>
                <button ref={confirmRef} type="button" className="btn-destructive" disabled={busy} onClick={() => void patch({ status: 'DEACTIVATED' })}>
                  {busy ? 'Deactivating…' : 'Yes, deactivate'}
                </button>
                <button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            )}
            {confirming === 'mfa' && (
              <div className="admin-confirm" role="alertdialog" aria-label="Confirm MFA reset">
                <span>They&apos;ll be signed out and must set up their authenticator again at next sign-in.</span>
                <button ref={confirmRef} type="button" className="btn-destructive" disabled={busy} onClick={() => void resetMfa()}>
                  {busy ? 'Resetting…' : 'Yes, reset MFA'}
                </button>
                <button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="admin-error">{error}</p>}
      </div>
    </div>
  )
}
