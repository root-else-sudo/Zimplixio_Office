import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as any).role
        token.mfaEnabled = (user as any).mfaEnabled
        token.mfaSecret = (user as any).mfaSecret
        token.mfaVerified = false
      }
      // Allow client-side useSession().update({ mfaVerified, mfaEnabled }) to
      // re-issue the JWT with refreshed flags. Without this, /api/mfa/verify
      // succeeds but the cookie keeps mfaVerified=false → middleware loop.
      if (trigger === 'update' && session && typeof session === 'object') {
        if ('mfaVerified' in session && typeof session.mfaVerified === 'boolean') {
          token.mfaVerified = session.mfaVerified
        }
        if ('mfaEnabled' in session && typeof session.mfaEnabled === 'boolean') {
          token.mfaEnabled = session.mfaEnabled
        }
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.mfaEnabled = token.mfaEnabled as boolean
      session.user.mfaVerified = token.mfaVerified as boolean
      return session
    },
  },
}
