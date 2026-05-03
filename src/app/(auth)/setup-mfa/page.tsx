'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2, CheckCircle } from 'lucide-react'

export default function SetupMfaPage() {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'qr' | 'verify' | 'done'>('idle')
  const [qrUrl, setQrUrl] = useState('')
  const [factorSid, setFactorSid] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function createFactor() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/mfa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to create MFA factor')
    } else {
      // bindingUri is an otpauth:// URI — convert to QR image via qrserver.com
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data.bindingUri)}&size=200x200&margin=10`
      setQrUrl(qrImageUrl)
      setFactorSid(data.factorSid)
      setStep('qr')
    }
    setLoading(false)
  }

  async function verifyFactor() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/mfa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', factorSid, code }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Invalid code, try again')
    } else {
      setStep('done')
      setTimeout(() => router.push('/'), 2000)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0f2044] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="font-[family-name:var(--font-poppins)] font-bold text-xl text-gray-900">
            Set up Authenticator
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1">
            Secure your account with Microsoft Authenticator
          </p>
        </div>

        {step === 'idle' && (
          <button
            onClick={createFactor}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Get started
          </button>
        )}

        {step === 'qr' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-600 text-center">
              Scan this QR code with Microsoft Authenticator, then enter the 6-digit code below.
            </p>
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="MFA QR code" className="w-48 h-48 rounded-lg border border-gray-200" />
            )}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={verifyFactor}
              disabled={loading || code.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-sm font-semibold text-gray-900">MFA enabled!</p>
            <p className="text-xs text-gray-500">Redirecting to dashboard…</p>
          </div>
        )}
      </div>
    </div>
  )
}
