'use client'

import { useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AuthCard, AuthAlert } from '@/components/auth/AuthCard'
import { CodeInput } from '@/components/auth/CodeInput'
import { useCodeVerification, toVerifyResult } from '@/components/auth/useCodeVerification'

async function verifyCode(code: string) {
  const res = await fetch('/api/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return toVerifyResult(res)
}

export default function VerifyMfaPage() {
  const { update } = useSession()

  // Re-issue the JWT cookie. The server only sets mfaVerified when this
  // proof checks out (src/lib/auth.ts) — the browser can't just claim it.
  const onVerified = useCallback((proof: string) => update({ mfaProof: proof }), [update])

  const { code, status, error, inputRef, onChange, submit } = useCodeVerification({
    verify: verifyCode,
    onVerified,
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [inputRef])

  const verified = status === 'success'

  return (
    <AuthCard
      title={verified ? 'You’re verified' : 'Enter your 6-digit code'}
      subtitle={
        verified
          ? 'Opening your office…'
          : 'Open your authenticator app and type the code shown for Zimplixio. It checks itself once all six digits are in.'
      }
      tone={verified ? 'success' : undefined}
    >
      <CodeInput ref={inputRef} value={code} status={status} onChange={onChange} onComplete={submit} />
      {error && <AuthAlert>{error}</AuthAlert>}
      {!verified && <p className="auth-hint">Codes refresh every 30 seconds.</p>}
    </AuthCard>
  )
}
