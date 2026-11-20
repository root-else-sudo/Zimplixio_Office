'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Mail, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react'
import { AuthCard, AuthAlert, AuthMessage, AuthFooterLine } from '@/components/auth/AuthCard'
import { AuthField } from '@/components/auth/AuthField'
import { useAuthScene } from '@/components/auth/AuthScene'
import { markSignedIn } from '@/lib/auth-redirect'

export default function LoginClient({
  returnTo,
  sessionEnded,
}: {
  /** Already validated by the server page (safeCallbackUrl). */
  returnTo: string
  sessionEnded: boolean
}) {
  const router = useRouter()
  const { lit } = useAuthScene()
  const emailRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Once the card has arrived, put the cursor in the email field — but only
  // on devices with a real pointer, so phones don't pop the keyboard open.
  useEffect(() => {
    if (!lit || !window.matchMedia('(pointer: fine)').matches) return
    const timer = window.setTimeout(() => emailRef.current?.focus(), 700)
    return () => window.clearTimeout(timer)
  }, [lit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', { email, password, redirect: false })

    if (res?.error) {
      setError('That email and password don’t match. Check them and try again.')
      setLoading(false)
      return
    }

    markSignedIn()
    // If MFA is on, middleware sends this on to /verify-mfa and keeps returnTo.
    router.push(returnTo)
  }

  return (
    <AuthCard
      title="Sign in to Zimplixio"
      footer={
        <>
          <AuthFooterLine icon={UserPlus}>Need access? Ask your Zimplixio admin to invite you.</AuthFooterLine>
          <AuthFooterLine icon={ShieldCheck}>Protected with two-step verification.</AuthFooterLine>
        </>
      }
    >
      {sessionEnded && (
        <AuthMessage tone="info">Your session ended. Sign in again to pick up where you left off.</AuthMessage>
      )}
      <form onSubmit={handleSubmit}>
        <AuthField
          ref={emailRef}
          label="Email"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
        <AuthField
          label="Password"
          icon={LockKeyhole}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          revealable
          capsLockWarning
          required
        />

        {error && <AuthAlert>{error}</AuthAlert>}

        <div className="auth-actions">
          <button type="submit" disabled={loading} className="btn-accent">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </AuthCard>
  )
}
