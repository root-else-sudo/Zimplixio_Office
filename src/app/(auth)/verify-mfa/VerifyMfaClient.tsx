'use client'

import { useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { UserRound } from 'lucide-react'
import { AuthCard, AuthAlert, AuthFooterLine } from '@/components/auth/AuthCard'
import { CodeInput } from '@/components/auth/CodeInput'
import { useCodeVerification, toVerifyResult } from '@/components/auth/useCodeVerification'
import { signOutDeliberately } from '@/lib/sign-out'

async function verifyCode(code: string) {
  const res = await fetch('/api/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return toVerifyResult(res)
}

export default function VerifyMfaClient({ returnTo }: { /** Validated by the server page. */ returnTo: string }) {
  const { data: session, update } = useSession()

  // Re-issue the JWT cookie. The server only sets mfaVerified when this
  // proof checks out (src/lib/auth.ts) — the browser can't just claim it.
  const onVerified = useCallback((proof: string) => update({ mfaProof: proof }), [update])

  const { code, status, error, inputRef, onChange, submit } = useCodeVerification({
    verify: verifyCode,
    onVerified,
    redirectTo: returnTo,
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [inputRef])

  const verified = status === 'success'
  const email = session?.user?.email

  return (
    <AuthCard
      title={verified ? 'You’re verified' : 'Enter your 6-digit code'}
      subtitle={
        verified
          ? 'Opening Zimplixio…'
          : 'Open your authenticator app and type the code shown for Zimplixio. It checks itself once all six digits are in.'
      }
      tone={verified ? 'success' : undefined}
      footer={
        !verified && (
          <AuthFooterLine icon={UserRound}>
            {email ? <>Signed in as {email}. </> : null}
            Not you?{' '}
            <button type="button" className="auth-link" onClick={() => signOutDeliberately()}>
              Sign out
            </button>
          </AuthFooterLine>
        )
      }
    >
      <CodeInput ref={inputRef} value={code} status={status} onChange={onChange} onComplete={submit} />
      {error && <AuthAlert>{error}</AuthAlert>}
      {!verified && <p className="auth-hint">Codes refresh every 30 seconds.</p>}
    </AuthCard>
  )
}
