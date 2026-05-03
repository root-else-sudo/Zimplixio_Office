import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { apiError } from './errors'

export type Role = 'ADMIN' | 'REVIEWER'

export type AuthedSession = Session & {
  user: NonNullable<Session['user']> & { id: string; role: Role }
}

const ROLE_RANK: Record<Role, number> = { REVIEWER: 1, ADMIN: 2 }

export function hasRole(actual: string | undefined, required: Role): boolean {
  if (!actual) return false
  const a = ROLE_RANK[actual as Role]
  return typeof a === 'number' && a >= ROLE_RANK[required]
}

export type RouteContext<P = Record<string, string>> = {
  params: Promise<P>
}

export type AuthedHandler<P> = (
  req: NextRequest,
  ctx: RouteContext<P>,
  session: AuthedSession
) => Promise<Response> | Response

export interface WithAuthOptions {
  role?: Role
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Same-origin check for state-changing requests. Compares the Origin (or
// Referer fallback) host against the request Host. Browsers always set Origin
// on cross-origin POSTs, so a mismatch is a strong CSRF signal.
function sameOrigin(req: NextRequest): boolean {
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

    const session = await auth()
    if (!session?.user?.id) return apiError('UNAUTHORIZED')
    if (opts.role && !hasRole(session.user.role, opts.role)) {
      return apiError('FORBIDDEN')
    }
    return handler(req, ctx, session as AuthedSession)
  }
}
