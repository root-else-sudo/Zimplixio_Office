'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ShieldCheck } from 'lucide-react'

export default function VerifyMfaPage() {
  const router = useRouter()
  const { update } = useSession()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Invalid code. Try again.')
      setLoading(false)
      return
    }

    // Re-issue the JWT cookie with mfaVerified=true, then hard-navigate so
    // the middleware always reads the fresh cookie. Client-side router.push
    // can race against the cookie write in production behind a proxy.
    await update({ mfaVerified: true })
    window.location.replace('/')
  }

  return (
    <div className="min-h-screen bg-[#0f2044] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[var(--green-50)] rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[var(--green-600)]" />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-poppins)] font-bold text-lg text-gray-900">
                Two-factor auth
              </h1>
              <p className="text-xs text-gray-500">Enter the code from Microsoft Authenticator</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center text-2xl tracking-[0.5em] px-3.5 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
              required
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="btn-primary w-full justify-center"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
