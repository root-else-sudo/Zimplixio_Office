import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    // Edge-safe base callback (this config is also used by src/proxy.ts).
    // It deliberately does NOT handle `trigger === 'update'`: session updates
    // come from the browser and must be checked against the database and a
    // server-signed MFA proof, which happens in src/lib/auth.ts.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = user.role
        token.mfaEnabled = user.mfaEnabled
        token.mfaSecret = user.mfaSecret
        token.mfaVerified = false
      }
      // Per-login session id — MFA proofs are bound to it. Also backfills
      // tokens issued before this field existed.
      if (!token.sid) token.sid = crypto.randomUUID()
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.mfaEnabled = token.mfaEnabled as boolean
      session.user.mfaVerified = token.mfaVerified as boolean
      session.user.sid = token.sid as string
      return session
    },
  },
}
