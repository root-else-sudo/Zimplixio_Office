import { DefaultSession } from 'next-auth'
import type { AccountKind } from '@/lib/accounts'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      mfaEnabled: boolean
      mfaVerified: boolean
      /** Per-login session id; MFA proofs are bound to it (src/lib/mfa-proof.ts). */
      sid: string
      companyId: string
      accountKind: AccountKind
      isPlatformAdmin: boolean
      /** Compared against the DB by getActiveSession (src/lib/session-guard.ts). */
      sessionVersion: number
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: string
    mfaEnabled: boolean
    mfaSecret: string | null
    companyId: string
    accountKind: AccountKind
    isPlatformAdmin: boolean
    sessionVersion: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    mfaEnabled: boolean
    mfaVerified: boolean
    mfaSecret: string | null
    sid: string
    companyId: string
    accountKind: AccountKind
    isPlatformAdmin: boolean
    sessionVersion: number
  }
}
