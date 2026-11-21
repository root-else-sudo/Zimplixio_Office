import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { authConfig } from './auth.config'
import { rateLimit } from './ratelimit'
import { verifyMfaProof } from './mfa-proof'
import { accountKindOf, normalizeEmail } from './accounts'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks!.jwt!(params)
      if (!token || params.trigger !== 'update') return token

      // A session update was requested by the browser (useSession().update).
      // Never trust its payload: re-read MFA state from the database, and only
      // mark the session verified with a valid server-signed proof.
      const userId = String(token.id)
      const sessionId = String(token.sid)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          mfaEnabled: true,
          mfaSecret: true,
          status: true,
          role: true,
          companyId: true,
          company: { select: { kind: true } },
        },
      })
      if (!user || user.status !== 'ACTIVE') return null // deleted or not active — end the session

      // Re-derive access claims from the DB. token.sessionVersion is deliberately
      // NOT refreshed here: doing so would heal a revoked token.
      const accountKind = accountKindOf(user.company.kind)
      token.companyId = user.companyId
      token.accountKind = accountKind
      token.isPlatformAdmin = user.role === 'ADMIN' && accountKind === 'STAFF'
      token.role = user.role

      token.mfaEnabled = user.mfaEnabled
      token.mfaSecret = user.mfaSecret

      const data = params.session as { mfaProof?: unknown; mfaVerified?: unknown } | undefined
      if (verifyMfaProof(data?.mfaProof, userId, sessionId)) {
        token.mfaVerified = true
      } else if (data?.mfaVerified === false) {
        token.mfaVerified = false // lowering is always safe (e.g. after disabling MFA)
      }
      return token
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = normalizeEmail(credentials.email as string)
        const limit = await rateLimit({
          scope: 'auth.login',
          actor: email,
          limit: 5,
          windowMs: 15 * 60 * 1000,
        })
        if (!limit.allowed) return null

        const user = await prisma.user.findUnique({
          where: { email },
          include: { company: { select: { kind: true, status: true } } },
        })
        if (!user || !user.passwordHash) return null
        if (user.status !== 'ACTIVE' || user.company.status !== 'ACTIVE') return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )
        if (!valid) return null

        const accountKind = accountKindOf(user.company.kind)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          mfaSecret: user.mfaSecret,
          companyId: user.companyId,
          accountKind,
          isPlatformAdmin: user.role === 'ADMIN' && accountKind === 'STAFF',
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
})
