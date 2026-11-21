import { notFound, redirect } from 'next/navigation'
import { getActiveSession, type ActiveSession } from '@/lib/session-guard'
import { SESSION_END_PATH } from '@/lib/auth-redirect'

export type Need = 'signedIn' | 'staff' | 'client' | 'platformAdmin'

export type AccessDecision =
  | { ok: true; active: ActiveSession }
  | { redirect: string }
  | { notFound: true }

/** Pure access decision, in rule order. The guards below just act on it. */
export function decideAccess(active: ActiveSession | null, need: Need): AccessDecision {
  if (!active) return { redirect: SESSION_END_PATH }
  if (!active.mfaEnabled) return { redirect: '/setup-mfa' }
  if (!active.mfaVerified) return { redirect: '/verify-mfa' }
  if (need === 'staff' && active.accountKind === 'CLIENT') return { redirect: '/portal' }
  if (need === 'client' && active.accountKind === 'STAFF') return { redirect: '/' }
  if (need === 'platformAdmin') {
    if (active.accountKind === 'CLIENT' || !active.isPlatformAdmin) return { notFound: true }
  }
  return { ok: true, active }
}

async function enforce(need: Need): Promise<ActiveSession> {
  const decision = decideAccess(await getActiveSession(), need)
  if ('ok' in decision) return decision.active
  if ('redirect' in decision) redirect(decision.redirect)
  notFound()
}

export const requireSignedIn = () => enforce('signedIn')
export const requireStaff = () => enforce('staff')
export const requireClient = () => enforce('client')
export const requirePlatformAdmin = () => enforce('platformAdmin')
