'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

function ZimplixioMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" overflow="visible" aria-label="Zimplixio">
      <circle cx="200" cy="200" r="160" stroke="#B8924A" strokeWidth="16" fill="none" />
      <path
        d="M 313,220 A 115,115 0 1,1 288,126 L 362,126 L 362,176 L 250,176 A 65,65 0 1,0 264,211 Z"
        fill="#276229"
      />
      <polyline points="183,183 168,200 183,217" stroke="#B8924A" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="217,183 232,200 217,217" stroke="#B8924A" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', { email, password, redirect: false })

    if (res?.error) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--navy-800)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <ZimplixioMark size={36} />
          <span className="font-bold text-2xl text-white tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            Zimplixio
          </span>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h1 className="font-bold text-xl text-gray-900 mb-1 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            Welcome back
          </h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to your workspace</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                placeholder="you@zimplixio.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary-brand w-full font-semibold py-2.5 rounded-lg text-sm"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
