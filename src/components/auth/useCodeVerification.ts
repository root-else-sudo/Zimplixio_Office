'use client'

import { useCallback, useRef, useState } from 'react'
import type { CodeStatus } from './CodeInput'

/** Keep the "circuit" on screen at least this long, even if the server answers instantly. */
const MIN_VERIFYING_MS = 1100
/** How long the error state shows (boxes fly back to the row, then shake) before clearing for another try. */
const ERROR_HOLD_MS = 1150
/** How long the green check shows before leaving the page. */
const SUCCESS_HOLD_MS = 1500

const NETWORK_ERROR = 'Couldn’t reach the server. Check your connection and try again.'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** On success the server returns a signed MFA proof (src/lib/mfa-proof.ts) — the only thing that can mark the session verified. */
export type VerifyResult = { ok: true; proof: string } | { ok: false; error: string }

/**
 * Turns an MFA API response into a VerifyResult with user-facing copy.
 * The routes return terse messages ("Invalid code"); the screen explains
 * what to do next instead.
 */
export async function toVerifyResult(res: Response): Promise<VerifyResult> {
  const data: { error?: string; code?: string; proof?: string } = await res.json().catch(() => ({}))
  if (res.ok && typeof data.proof === 'string') return { ok: true, proof: data.proof }
  if (res.ok) return { ok: false, error: 'Something went wrong verifying that code. Try again.' }
  if (res.status === 429 || data.code === 'RATE_LIMITED') {
    return { ok: false, error: 'Too many attempts. Wait 15 minutes, then try again with a fresh code.' }
  }
  if (data.error === 'Invalid code') {
    return { ok: false, error: 'That code didn’t match. Use the code your authenticator app shows right now.' }
  }
  if (data.error === 'MFA is already set up for this account') {
    return { ok: false, error: 'Two-step sign-in is already set up for this account.' }
  }
  return { ok: false, error: data.error ?? 'Something went wrong verifying that code. Try again.' }
}

/**
 * Shared state machine for the 6-digit code screens (verify-mfa, setup-mfa):
 * idle → verifying → success (then `onVerified`, then a hard redirect)
 *                  ↘ error → idle (boxes cleared, focus back in the input)
 *
 * The animation only reflects the real server answer — `success` is never
 * shown before `verify` resolves ok.
 */
export function useCodeVerification({
  verify,
  onVerified,
  redirectTo = '/',
}: {
  verify: (code: string) => Promise<VerifyResult>
  /** Runs alongside the success animation — receives the server's proof to refresh the session cookie with. */
  onVerified: (proof: string) => Promise<unknown>
  redirectTo?: string
}) {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<CodeStatus>('idle')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(
    async (value: string) => {
      setStatus('verifying')
      setError('')

      const [result] = await Promise.all([
        verify(value).catch((): VerifyResult => ({ ok: false, error: NETWORK_ERROR })),
        wait(MIN_VERIFYING_MS),
      ])

      if (result.ok) {
        setStatus('success')
        await Promise.all([onVerified(result.proof), wait(SUCCESS_HOLD_MS)])
        // Hard navigation so middleware reads the freshly re-issued JWT cookie;
        // a client-side push can race the cookie write behind the proxy.
        window.location.replace(redirectTo)
        return
      }

      setStatus('error')
      setError(result.error)
      await wait(ERROR_HOLD_MS)
      setCode('')
      setStatus('idle')
      inputRef.current?.focus()
    },
    [verify, onVerified, redirectTo],
  )

  const onChange = useCallback((value: string) => {
    setCode(value)
    if (value.length > 0) setError('')
  }, [])

  return { code, status, error, inputRef, onChange, submit }
}
