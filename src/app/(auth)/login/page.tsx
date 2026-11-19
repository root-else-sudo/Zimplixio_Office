'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Mail, LockKeyhole } from 'lucide-react'
import { AuthCard, AuthAlert } from '@/components/auth/AuthCard'
import { AuthField } from '@/components/auth/AuthField'
import { useAuthScene } from '@/components/auth/AuthScene'

export default function LoginPage() {
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

    router.push('/')
  }

  return (
    <AuthCard title="Sign in to your office">
      <form onSubmit={handleSubmit} noValidate={false}>
        <AuthField
          ref={emailRef}
          label="Email"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@zimplixio.com"
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
