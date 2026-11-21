import { describe, it, expect } from 'vitest'
import { decideAccess } from '@/lib/guards'
import type { ActiveSession } from '@/lib/session-guard'

const base: ActiveSession = {
  userId: 'u1', email: 'a@example.test', name: 'A', sid: 's1', companyId: 'c1',
  accountKind: 'STAFF', isPlatformAdmin: true, mfaEnabled: true, mfaVerified: true,
}
const staff = (o: Partial<ActiveSession> = {}): ActiveSession => ({ ...base, ...o })
const client = (o: Partial<ActiveSession> = {}): ActiveSession => ({ ...base, accountKind: 'CLIENT', isPlatformAdmin: false, ...o })

describe('decideAccess', () => {
  it('no session → session-end route (breaks the proxy/login loop)', () => expect(decideAccess(null, 'staff')).toEqual({ redirect: '/api/session/end' }))
  it('unenrolled → setup-mfa', () => expect(decideAccess(staff({ mfaEnabled: false }), 'staff')).toEqual({ redirect: '/setup-mfa' }))
  it('unverified → verify-mfa', () => expect(decideAccess(staff({ mfaVerified: false }), 'signedIn')).toEqual({ redirect: '/verify-mfa' }))
  it('client on staff area → portal', () => expect(decideAccess(client(), 'staff')).toEqual({ redirect: '/portal' }))
  it('staff on portal → home', () => expect(decideAccess(staff(), 'client')).toEqual({ redirect: '/' }))
  it('admin area hidden from clients and non-admin staff', () => {
    expect(decideAccess(client(), 'platformAdmin')).toEqual({ notFound: true })
    expect(decideAccess(staff({ isPlatformAdmin: false }), 'platformAdmin')).toEqual({ notFound: true })
  })
  it('platform admin staff is admitted', () => expect(decideAccess(staff(), 'platformAdmin')).toMatchObject({ ok: true }))
  it('signedIn admits both kinds', () => {
    expect(decideAccess(client(), 'signedIn')).toMatchObject({ ok: true })
    expect(decideAccess(staff(), 'signedIn')).toMatchObject({ ok: true })
  })
})
