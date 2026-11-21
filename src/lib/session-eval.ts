import type { CompanyKind, CompanyStatus, Role, UserStatus } from '@prisma/client'
import { accountKindOf, type AccountKind } from '@/lib/accounts'

export type ActiveSession = {
  userId: string
  email: string
  name: string
  sid: string
  companyId: string
  accountKind: AccountKind
  isPlatformAdmin: boolean
  mfaEnabled: boolean
  mfaVerified: boolean
}

export type TokenClaims = {
  id?: string
  sid?: string
  companyId?: string
  accountKind?: string
  sessionVersion?: number
  mfaVerified?: boolean
}

export type DbUserState = {
  id: string
  email: string
  name: string
  status: UserStatus
  sessionVersion: number
  role: Role
  mfaEnabled: boolean
  companyId: string
  company: { kind: CompanyKind; status: CompanyStatus }
} | null

/**
 * Pure check of a token's claims against the current DB state. Returns the
 * trusted session, or null if the session must be treated as ended.
 * Account kind and platform-admin status are always derived from the DB.
 */
export function evaluateSession(claims: TokenClaims, db: DbUserState): ActiveSession | null {
  if (!db) return null
  if (
    !claims.id ||
    !claims.sid ||
    !claims.companyId ||
    !claims.accountKind ||
    typeof claims.sessionVersion !== 'number'
  ) {
    return null
  }
  if (claims.id !== db.id) return null
  if (db.status !== 'ACTIVE' || db.company.status !== 'ACTIVE') return null
  if (claims.sessionVersion !== db.sessionVersion) return null
  if (claims.companyId !== db.companyId) return null

  const accountKind = accountKindOf(db.company.kind)
  if (claims.accountKind !== accountKind) return null

  return {
    userId: db.id,
    email: db.email,
    name: db.name,
    sid: claims.sid,
    companyId: db.companyId,
    accountKind,
    isPlatformAdmin: db.role === 'ADMIN' && accountKind === 'STAFF',
    mfaEnabled: db.mfaEnabled,
    mfaVerified: claims.mfaVerified === true,
  }
}

/** The columns evaluateSession needs. Shared by getActiveSession and the proxy. */
export const USER_STATE_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  sessionVersion: true,
  role: true,
  mfaEnabled: true,
  companyId: true,
  company: { select: { kind: true, status: true } },
} as const
