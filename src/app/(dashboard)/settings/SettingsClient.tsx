'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function SettingsClient({ initialMfaEnabled }: { initialMfaEnabled: boolean }) {
  const { update } = useSession()
  const [mfaEnabled, setMfaEnabled] = useState(initialMfaEnabled)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDisable() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mfa/disable', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to disable two-factor authentication')
      }
      await update({ mfaEnabled: false, mfaVerified: false })
      setMfaEnabled(false)
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable two-factor authentication')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          Account
        </h1>
      </div>

      <div className="soft-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--gray-900)' }}>
            Two-factor authentication
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--gray-600)' }}>
            Adds a 6-digit code from an authenticator app to every sign-in, so a password alone can&apos;t access your account.
          </p>
        </div>

        <p className="text-sm font-medium" style={{ color: mfaEnabled ? 'var(--green-600)' : 'var(--gray-600)' }}>
          Status: {mfaEnabled ? 'Enabled' : 'Not enabled'}
        </p>

        {error && (
          <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        {!mfaEnabled && (
          <Link href="/setup-mfa" className="btn-primary inline-block">
            Enable two-factor authentication
          </Link>
        )}

        {mfaEnabled && !confirming && (
          <button className="btn-destructive" onClick={() => setConfirming(true)}>
            Disable two-factor authentication
          </button>
        )}

        {mfaEnabled && confirming && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--gray-900)' }}>
              This removes two-factor authentication from your account. Continue?
            </p>
            <div className="flex gap-3">
              <button className="btn-destructive" onClick={handleDisable} disabled={loading}>
                {loading ? 'Disabling…' : 'Confirm disable'}
              </button>
              <button className="btn-outline" onClick={() => setConfirming(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
