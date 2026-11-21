'use client'

import { useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { formatDateTime } from '@/lib/admin/format'

export default function InviteLinkCard({
  name, url, expiresAt, onDismiss,
}: { name: string; url: string; expiresAt: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function copy() {
    setFailed(false)
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      inputRef.current?.select()
      setFailed(true)
    }
  }

  return (
    <div className="soft-card admin-card" role="status" aria-label="Invite link">
      <div className="admin-toolbar">
        <h2 className="admin-section-title">Invite link for {name}</h2>
        <button type="button" className="btn-outline" onClick={onDismiss} aria-label="Dismiss invite link">
          <X className="h-4 w-4" /> Dismiss
        </button>
      </div>
      <p className="admin-note">
        This link is shown once. Send it to {name} through a channel you trust. It expires {formatDateTime(expiresAt)}.
      </p>
      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label" htmlFor="invite-url">Invite link</label>
          <input
            id="invite-url"
            ref={inputRef}
            className="admin-input"
            value={url}
            readOnly
            onFocus={e => e.currentTarget.select()}
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {failed && <p role="alert" className="admin-error">Could not copy automatically. The link is selected: press Ctrl/Cmd+C.</p>}
    </div>
  )
}
