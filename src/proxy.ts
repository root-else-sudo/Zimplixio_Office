import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import { authUrl, SIGNED_IN_MARKER } from '@/lib/auth-redirect'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname, search } = req.nextUrl
  const isLoggedIn = !!req.auth
  const mfaEnabled = req.auth?.user?.mfaEnabled
  const mfaVerified = req.auth?.user?.mfaVerified

  const publicPaths = ['/login']
  const mfaPaths = ['/verify-mfa', '/setup-mfa']
  // Where the person was trying to go — carried through login and MFA.
  const returnTo = pathname + search

  if (publicPaths.includes(pathname)) {
    if (isLoggedIn) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    const sessionEnded = req.cookies.has(SIGNED_IN_MARKER)
    return NextResponse.redirect(authUrl('/login', req.url, { returnTo, sessionEnded }))
  }

  if (mfaEnabled && !mfaVerified && !mfaPaths.includes(pathname)) {
    return NextResponse.redirect(authUrl('/verify-mfa', req.url, { returnTo }))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
