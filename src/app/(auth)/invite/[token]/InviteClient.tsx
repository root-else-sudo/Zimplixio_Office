'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Mail, LockKeyhole, ShieldCheck } from 'lucide-react'
import { AuthCard, AuthAlert, AuthFooterLine } from '@/components/auth/AuthCard'
import { AuthField } from '@/components/auth/AuthField'
import { markSignedIn } from '@/lib/auth-redirect'
import { passwordSchema } from '@/lib/password-policy'

export default function InviteClient({ token, name, email }: { token: string; name: string; email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const check = passwordSchema(email).safeParse(password)
    if (!check.success) return setError(check.error.issues[0].message)
    if (password !== confirm) return setError('The two passwords don’t match.')

    setLoading(true)
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.')
        setLoading(false)
        return
      }
      const signedIn = await signIn('credentials', { email, password, redirect: false })
      if (signedIn?.error) {
        // Account is set up; just the automatic sign-in failed.
        window.location.replace('/login')
        return
      }
      markSignedIn()
      // The proxy sends a new account on to two-step setup.
      window.location.replace('/')
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Accept your invite"
      subtitle={`Welcome, ${name}. Choose a password to finish setting up your account.`}
      footer={<AuthFooterLine icon={ShieldCheck}>Next, you’ll set up two-step verification.</AuthFooterLine>}
    >
      <form onSubmit={handleSubmit}>
        <AuthField label="Email" icon={Mail} type="email" name="email" value={email} readOnly autoComplete="username" />
        <AuthField
          label="Password"
          icon={LockKeyhole}
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          revealable
          capsLockWarning
          required
        />
        <AuthField
          label="Confirm password"
          icon={LockKeyhole}
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          revealable
          capsLockWarning
          required
        />
        {error && <AuthAlert>{error}</AuthAlert>}
        <div className="auth-actions">
          <button type="submit" disabled={loading} className="btn-accent">
            {loading ? 'Setting up…' : 'Create my account'}
          </button>
        </div>
      </form>
    </AuthCard>
  )
}
