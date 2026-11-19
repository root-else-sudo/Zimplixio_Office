import { createHmac, timingSafeEqual } from 'node:crypto'
import { serverEnv } from './env'

/**
 * Server-signed proof that a TOTP code was just approved for one specific
 * login session. It's the ONLY thing that can flip a session's JWT to
 * `mfaVerified: true` (see the `update` handling in src/lib/auth.ts).
 *
 * Why: the session refresh endpoint (`useSession().update(data)`) is callable
 * by any logged-in browser with arbitrary `data`, so the JWT must never trust
 * a client-supplied `mfaVerified: true`. Before this existed, a password alone
 * was enough to bypass MFA.
 *
 * Format: base64url(payload) + "." + base64url(HMAC-SHA256(payload)).
 * Bound to the user id AND the session id (`sid`, minted at login), and
 * expires after PROOF_TTL_MS — so a proof can't be replayed into another
 * session or reused later.
 */

const PROOF_TTL_MS = 2 * 60 * 1000
const PURPOSE = 'mfa-verified'

type ProofPayload = { p: typeof PURPOSE; uid: string; sid: string; exp: number }

function sign(data: string): string {
  // Domain-separated key: never the raw NextAuth secret used for the JWT itself.
  return createHmac('sha256', `${serverEnv.NEXTAUTH_SECRET}:${PURPOSE}`).update(data).digest('base64url')
}

export function createMfaProof(userId: string, sessionId: string): string {
  const payload: ProofPayload = { p: PURPOSE, uid: userId, sid: sessionId, exp: Date.now() + PROOF_TTL_MS }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifyMfaProof(proof: unknown, userId: string, sessionId: string): boolean {
  if (typeof proof !== 'string' || proof.length > 1024) return false
  const [data, signature, ...rest] = proof.split('.')
  if (!data || !signature || rest.length > 0) return false

  const expected = Buffer.from(sign(data))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as Partial<ProofPayload>
    return (
      payload.p === PURPOSE &&
      payload.uid === userId &&
      payload.sid === sessionId &&
      typeof payload.exp === 'number' &&
      payload.exp > Date.now()
    )
  } catch {
    return false
  }
}
