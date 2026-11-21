import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ActiveSession } from '@/lib/session-guard'

const getActiveSession = vi.fn()
vi.mock('@/lib/session-guard', () => ({ getActiveSession: () => getActiveSession() }))
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'u1', sid: 's', name: 'N', email: 'e@x.test' } }),
}))

import { withAuth, type WithAuthOptions } from '@/lib/rbac'

const base: ActiveSession = {
  userId: 'u1', email: 'e@x.test', name: 'N', sid: 's', companyId: 'c1',
  accountKind: 'STAFF', isPlatformAdmin: false, mfaEnabled: true, mfaVerified: true,
}
const staff = (o: Partial<ActiveSession> = {}): ActiveSession => ({ ...base, ...o })
const client = (o: Partial<ActiveSession> = {}): ActiveSession => ({ ...base, accountKind: 'CLIENT', ...o })

const ok = () => new Response('ok')
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
async function call(
  handler: Handler,
  active: ActiveSession | null
): Promise<number> {
  getActiveSession.mockResolvedValue(active)
  const res = await handler(new NextRequest('http://localhost/api/x'), { params: Promise.resolve({}) })
  return res.status
}
const w = (opts?: WithAuthOptions): Handler => withAuth<Record<string, string>>(ok, opts)

describe('withAuth', () => {
  beforeEach(() => getActiveSession.mockReset())

  it('defaults to staff-only: client gets 404', async () => expect(await call(w(), client())).toBe(404))
  it('staff passes the default', async () => expect(await call(w(), staff())).toBe(200))
  it('no active session → 401', async () => expect(await call(w(), null)).toBe(401))
  it('unenrolled → 403 unless allowUnenrolled', async () => {
    expect(await call(w(), staff({ mfaEnabled: false }))).toBe(403)
    expect(await call(w({ audience: 'any', allowUnenrolled: true, skipMfaCheck: true }), staff({ mfaEnabled: false }))).toBe(200)
  })
  it('enrolled but unverified → 403 unless skipMfaCheck', async () => {
    expect(await call(w(), staff({ mfaVerified: false }))).toBe(403)
    expect(await call(w({ skipMfaCheck: true }), staff({ mfaVerified: false }))).toBe(200)
  })
  it('client audience rejects staff with 404', async () =>
    expect(await call(w({ audience: 'client' }), staff())).toBe(404))
  it('any audience admits both', async () => {
    expect(await call(w({ audience: 'any' }), client())).toBe(200)
    expect(await call(w({ audience: 'any' }), staff())).toBe(200)
  })
  it('platformAdmin: client 404, non-admin staff 403, admin 200', async () => {
    expect(await call(w({ platformAdmin: true }), client())).toBe(404)
    expect(await call(w({ platformAdmin: true }), staff({ isPlatformAdmin: false }))).toBe(403)
    expect(await call(w({ platformAdmin: true }), staff({ isPlatformAdmin: true }))).toBe(200)
  })
})
