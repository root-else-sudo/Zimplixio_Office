import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as any).role
        token.mfaEnabled = (user as any).mfaEnabled
        token.mfaSecret = (user as any).mfaSecret
        token.mfaVerified = false
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
