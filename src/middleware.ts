import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const mfaEnabled = req.auth?.user?.mfaEnabled
  const mfaVerified = req.auth?.user?.mfaVerified

  const publicPaths = ['/login']
  const mfaPaths = ['/verify-mfa', '/setup-mfa']

  if (publicPaths.includes(pathname)) {
    if (isLoggedIn) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (mfaEnabled && !mfaVerified && !mfaPaths.includes(pathname)) {
    return NextResponse.redirect(new URL('/verify-mfa', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
