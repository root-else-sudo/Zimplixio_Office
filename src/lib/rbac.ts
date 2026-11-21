import { NextRequest } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { apiError } from './errors'
import { getActiveSession, type ActiveSession } from './session-guard'

export type Role = 'ADMIN' | 'REVIEWER'

export type AuthedSession = Session & {
  user: NonNullable<Session['user']> & { id: string }
  active: ActiveSession
}

export type RouteContext<P = Record<string, string>> = {
  params: Promise<P>
}

export type AuthedHandler<P> = (
  req: NextRequest,
  ctx: RouteContext<P>,
  session: AuthedSession
) => Promise<Response> | Response

export type Audience = 'staff' | 'client' | 'any'

export interface WithAuthOptions {
  /** Who may call the route. Default 'staff'; a mismatch answers 404. */
  audience?: Audience
  /** Platform admins only (staff with verified MFA). */
  platformAdmin?: boolean
  skipMfaCheck?: boolean
  /** Allow accounts that have not enrolled in MFA yet (enrollment routes only). */
  allowUnenrolled?: boolean
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Same-origin check for state-changing requests. Compares the Origin (or
// Referer fallback) host against the request Host. Browsers always set Origin
// on cross-origin POSTs, so a mismatch is a strong CSRF signal.
export function sameOrigin(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true

  const host =
    req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!host) return false

  const originHeader = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const candidate = originHeader ?? referer
  if (!candidate) return false

  try {
    const url = new URL(candidate)
    return url.host === host
  } catch {
    return false
  }
}

export function withAuth<P = Record<string, string>>(
  handler: AuthedHandler<P>,
  opts: WithAuthOptions = {}
): (req: NextRequest, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    if (!sameOrigin(req)) return apiError('FORBIDDEN', 'Cross-origin request rejected')

    const active = await getActiveSession()
    if (!active) return apiError('UNAUTHORIZED')

    if (!active.mfaEnabled && !opts.allowUnenrolled) {
      return apiError('FORBIDDEN', 'MFA enrollment required')
    }
    if (active.mfaEnabled && !active.mfaVerified && !opts.skipMfaCheck) {
      return apiError('FORBIDDEN', 'MFA verification required')
    }

    const audience = opts.audience ?? 'staff'
    if (audience === 'staff' && active.accountKind !== 'STAFF') return apiError('NOT_FOUND')
    if (audience === 'client' && active.accountKind !== 'CLIENT') return apiError('NOT_FOUND')

    if (opts.platformAdmin) {
      if (active.accountKind !== 'STAFF') return apiError('NOT_FOUND')
      if (!active.isPlatformAdmin || !active.mfaEnabled || !active.mfaVerified) {
        return apiError('FORBIDDEN')
      }
    }

    const session = await auth()
    if (!session?.user?.id) return apiError('UNAUTHORIZED')
    return handler(req, ctx, { ...session, active } as AuthedSession)
  }
}
