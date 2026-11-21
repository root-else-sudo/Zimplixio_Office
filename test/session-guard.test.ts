import { describe, it, expect } from 'vitest'
import { evaluateSession, type TokenClaims, type DbUserState } from '@/lib/session-guard'

const claims = (o: Partial<TokenClaims> = {}): TokenClaims => ({
  id: 'u1',
  sid: 's',
  companyId: 'c1',
  accountKind: 'STAFF',
  sessionVersion: 0,
  mfaVerified: false,
  ...o,
})

const db = (o: Partial<NonNullable<DbUserState>> = {}): DbUserState => ({
  id: 'u1',
  email: 'user@example.test',
  name: 'Test User',
  status: 'ACTIVE',
  sessionVersion: 0,
  role: 'ADMIN',
  mfaEnabled: false,
  companyId: 'c1',
  company: { kind: 'INTERNAL', status: 'ACTIVE' },
  ...o,
})

describe('evaluateSession', () => {
  it('accepts a matching active session', () =>
    expect(evaluateSession(claims(), db())).toMatchObject({ accountKind: 'STAFF', isPlatformAdmin: true }))
  it('rejects tokens missing new claims (pre-deploy tokens)', () =>
    expect(evaluateSession({ id: 'u1', sid: 's' }, db())).toBeNull())
  it('rejects a sessionVersion mismatch', () =>
    expect(evaluateSession(claims({ sessionVersion: 0 }), db({ sessionVersion: 1 }))).toBeNull())
  it('rejects a deactivated user', () =>
    expect(evaluateSession(claims(), db({ status: 'DEACTIVATED' }))).toBeNull())
  it('rejects an INVITED user', () =>
    expect(evaluateSession(claims(), db({ status: 'INVITED' }))).toBeNull())
  it('rejects when the company is deactivated', () =>
    expect(evaluateSession(claims(), db({ company: { kind: 'INTERNAL', status: 'DEACTIVATED' } }))).toBeNull())
  it('rejects when the token company differs from the DB', () =>
    expect(evaluateSession(claims({ companyId: 'other' }), db())).toBeNull())
  it('rejects a deleted user', () => expect(evaluateSession(claims(), null)).toBeNull())
  it('ADMIN on a client company is never platform admin', () =>
    expect(
      evaluateSession(
        claims({ accountKind: 'CLIENT' }),
        db({ role: 'ADMIN', company: { kind: 'CLIENT', status: 'ACTIVE' } }),
      )?.isPlatformAdmin,
    ).toBe(false))
  it('kind comes from the DB, not the token', () =>
    expect(
      evaluateSession(
        claims({ accountKind: 'STAFF' }),
        db({ company: { kind: 'CLIENT', status: 'ACTIVE' }, role: 'REVIEWER' }),
      ),
    ).toBeNull())
})
