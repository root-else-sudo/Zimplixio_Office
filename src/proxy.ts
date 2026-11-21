import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import {
  authUrl, SIGNED_IN_MARKER, SESSION_END_PATH, clientMayVisit, enrollmentMayVisit, isPublicPath,
} from '@/lib/auth-redirect'
import { isSessionStillActive } from '@/lib/proxy-session'
import { logger } from '@/lib/logger'

const { auth } = NextAuth(authConfig)

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl
  // accountKind is only present on tokens issued after the access rollout.
  const isLoggedIn = !!req.auth?.user?.accountKind
  const accountKind = req.auth?.user?.accountKind
  const mfaEnabled = req.auth?.user?.mfaEnabled
  const mfaVerified = req.auth?.user?.mfaVerified

  const mfaPaths = ['/verify-mfa', '/setup-mfa']
  // Where the person was trying to go — carried through login and MFA.
  const returnTo = pathname + search

  if (isPublicPath(pathname)) {
    // Invite links must open for anyone, signed in or not; no session check.
    if (pathname === '/invite' || pathname.startsWith('/invite/')) return NextResponse.next()
    if (isLoggedIn) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    const sessionEnded = req.cookies.has(SIGNED_IN_MARKER)
    return NextResponse.redirect(authUrl('/login', req.url, { returnTo, sessionEnded }))
  }

  // Why this DB check lives here: client-side navigation between pages inside
  // one route group runs neither the layout nor the template, so the guards
  // there never fire. Every navigation (including RSC fetches) passes through
  // the proxy, which runs on Node and can reach the DB. Fail closed.
  const user = req.auth?.user
  try {
    const active = await isSessionStillActive({
      id: user?.id,
      sid: user?.sid,
      companyId: user?.companyId,
      accountKind: user?.accountKind,
      sessionVersion: user?.sessionVersion,
      mfaVerified: user?.mfaVerified,
    })
    if (!active) return NextResponse.redirect(new URL(SESSION_END_PATH, req.url))
  } catch (err) {
    logger.error({ err }, 'proxy session check failed; ending session')
    return NextResponse.redirect(new URL(SESSION_END_PATH, req.url))
  }

  if (mfaEnabled && !mfaVerified && !mfaPaths.includes(pathname)) {
    return NextResponse.redirect(authUrl('/verify-mfa', req.url, { returnTo }))
  }

  if (mfaEnabled === false && !enrollmentMayVisit(pathname)) {
    return NextResponse.redirect(new URL('/setup-mfa', req.url))
  }

  if (accountKind === 'CLIENT' && !clientMayVisit(pathname)) {
    return NextResponse.redirect(new URL('/portal', req.url))
  }

  if (accountKind === 'STAFF' && (pathname === '/portal' || pathname.startsWith('/portal/'))) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
