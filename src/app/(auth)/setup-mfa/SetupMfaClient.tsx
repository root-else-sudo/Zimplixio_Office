'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import QRCode from 'qrcode'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AuthCard, AuthAlert, AuthFooterLine } from '@/components/auth/AuthCard'
import { CodeInput } from '@/components/auth/CodeInput'
import { useCodeVerification, toVerifyResult } from '@/components/auth/useCodeVerification'

export default function SetupMfaClient() {
  const { update } = useSession()
  const [step, setStep] = useState<'start' | 'scan'>('start')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [factorSid, setFactorSid] = useState('')
  const [startError, setStartError] = useState('')
  const [starting, setStarting] = useState(false)

  async function createFactor() {
    setStarting(true)
    setStartError('')
    try {
      const res = await fetch('/api/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStartError(data.error ?? 'Couldn’t start setup. Try again.')
        return
      }
      // bindingUri is an otpauth:// URI containing the TOTP secret. Render it
      // locally — never send it to a third-party QR service.
      setQrDataUrl(await QRCode.toDataURL(data.bindingUri, { margin: 0, width: 344 }))
      setFactorSid(data.factorSid)
      setStep('scan')
    } catch {
      setStartError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setStarting(false)
    }
  }

  const verify = useCallback(
    async (code: string) => {
      const res = await fetch('/api/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', factorSid, code }),
      })
      return toVerifyResult(res)
    },
    [factorSid],
  )

  // Refresh the JWT: the server re-reads mfaEnabled from the DB and marks the
  // session verified only with this proof (src/lib/auth.ts).
  const onVerified = useCallback((proof: string) => update({ mfaProof: proof }), [update])

  const { code, status, error, inputRef, onChange, submit } = useCodeVerification({ verify, onVerified })

  // Cursor goes straight into the code boxes once the QR code is up.
  useEffect(() => {
    if (step === 'scan') inputRef.current?.focus()
  }, [step, inputRef])

  const verified = status === 'success'

  const backFooter = (
    <AuthFooterLine icon={ArrowLeft}>
      Not now?{' '}
      <Link href="/settings" className="auth-link">
        Back to settings
      </Link>
    </AuthFooterLine>
  )

  if (step === 'start') {
    return (
      <AuthCard
        title="Turn on two-step sign-in"
        footer={backFooter}
        subtitle="Each time you sign in, you’ll also enter a code from an authenticator app on your phone, such as Microsoft Authenticator."
      >
        {startError && <AuthAlert>{startError}</AuthAlert>}
        <div className="auth-actions">
          <button type="button" onClick={createFactor} disabled={starting} className="btn-accent">
            {starting ? 'Preparing your QR code…' : 'Show my QR code'}
          </button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={verified ? 'Two-step sign-in is on' : 'Scan, then enter the code'}
      subtitle={
        verified
          ? 'Opening Zimplixio…'
          : 'In your authenticator app, add an account and scan this code. Then type the 6-digit code it shows.'
      }
      tone={verified ? 'success' : undefined}
      footer={!verified && backFooter}
    >
      <div className="auth-qr">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data: URL, nothing to optimize
          <img src={qrDataUrl} alt="QR code for adding Zimplixio Office to your authenticator app" />
        ) : (
          <div className="auth-qr-skeleton" />
        )}
      </div>
      <CodeInput ref={inputRef} value={code} status={status} onChange={onChange} onComplete={submit} />
      {error && <AuthAlert>{error}</AuthAlert>}
    </AuthCard>
  )
}
