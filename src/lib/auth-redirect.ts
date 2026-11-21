/**
 * Shared rules for moving people in and out of the auth screens. Used by the
 * middleware (src/proxy.ts), the auth pages and sign-out, so the behavior is
 * defined once. Edge-safe: no Node or database imports.
 */

/** The auth screens. Never a valid place to "return to" after signing in. */
export const AUTH_PATHS = ['/login', '/verify-mfa', '/setup-mfa'] as const

/** Query param carrying the page someone was trying to reach. */
export const CALLBACK_PARAM = 'callbackUrl'

/** Query param explaining why someone landed on /login. */
export const REASON_PARAM = 'reason'
export const REASON_SESSION_ENDED = 'session-ended'

/**
 * Non-sensitive marker cookie: "this browser was signed in". Set after a
 * successful login, cleared on a deliberate sign-out. If someone hits a
 * protected page signed out while it's still present, their session ended
 * on its own (timeout, revoked) — so /login can say so. Needed because an
 * expired session cookie is simply deleted by the browser, making it
 * indistinguishable from a first visit.
 */
export const SIGNED_IN_MARKER = 'zx_signed_in'

/**
 * Returns `value` only if it's a safe same-site path to send someone to after
 * signing in; otherwise null. Blocks open redirects (`//evil.com`,
 * `/\evil.com`, absolute URLs) and loops back into the auth screens.
 */
export function safeCallbackUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  const path = value.split(/[?#]/)[0]
  if ((AUTH_PATHS as readonly string[]).includes(path)) return null
  return value
}

/** Builds an auth-screen URL that remembers where the person was headed. */
export function authUrl(
  authPath: (typeof AUTH_PATHS)[number],
  base: string | URL,
  opts: { returnTo?: string; sessionEnded?: boolean } = {},
): URL {
  const url = new URL(authPath, base)
  const returnTo = safeCallbackUrl(opts.returnTo)
  if (returnTo && returnTo !== '/') url.searchParams.set(CALLBACK_PARAM, returnTo)
  if (opts.sessionEnded) url.searchParams.set(REASON_PARAM, REASON_SESSION_ENDED)
  return url
}

/* ── Browser-only helpers for the marker cookie ── */

export function markSignedIn() {
  document.cookie = `${SIGNED_IN_MARKER}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

export function clearSignedInMarker() {
  document.cookie = `${SIGNED_IN_MARKER}=; Path=/; Max-Age=0; SameSite=Lax`
}

/* ── Page-wall rules (shared by the proxy and the server guards) ── */

/** Signed-out/revoked sessions are sent here to clear the cookie, then on to /login. */
export const SESSION_END_PATH = '/api/session/end'

/** The only places a client account may visit. */
export const CLIENT_ALLOWED_PREFIXES = ['/portal', '/settings', '/setup-mfa', '/verify-mfa', '/login']

/** The only places someone without MFA enrolled may visit. */
export const ENROLLMENT_ALLOWED_PREFIXES = ['/setup-mfa', '/login']

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function clientMayVisit(pathname: string): boolean {
  return matchesPrefix(pathname, CLIENT_ALLOWED_PREFIXES)
}

export function enrollmentMayVisit(pathname: string): boolean {
  return matchesPrefix(pathname, ENROLLMENT_ALLOWED_PREFIXES)
}
