import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      mfaEnabled: boolean
      mfaVerified: boolean
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: string
    mfaEnabled: boolean
    mfaSecret: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    mfaEnabled: boolean
    mfaVerified: boolean
    mfaSecret: string | null
  }
}
