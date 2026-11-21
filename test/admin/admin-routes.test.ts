import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getActiveSession = vi.fn()
vi.mock('@/lib/session-guard', () => ({ getActiveSession: () => getActiveSession() }))
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'admin1', sid: 's', name: 'A', email: 'a@x.test' } }),
}))
vi.mock('@/lib/env', () => ({ serverEnv: { NEXTAUTH_URL: 'https://crm.example.test' } }))

const svc = {
  inviteUser: vi.fn(), renameUser: vi.fn(), setUserStatus: vi.fn(), resetUserMfa: vi.fn(), reissueInvite: vi.fn(),
  createCompany: vi.fn(), renameCompany: vi.fn(), setCompanyStatus: vi.fn(),
}
vi.mock('@/lib/admin/users', () => ({
  inviteUser: (...a: unknown[]) => svc.inviteUser(...a),
  renameUser: (...a: unknown[]) => svc.renameUser(...a),
  setUserStatus: (...a: unknown[]) => svc.setUserStatus(...a),
  resetUserMfa: (...a: unknown[]) => svc.resetUserMfa(...a),
  reissueInvite: (...a: unknown[]) => svc.reissueInvite(...a),
}))
vi.mock('@/lib/admin/companies', () => ({
  createCompany: (...a: unknown[]) => svc.createCompany(...a),
  renameCompany: (...a: unknown[]) => svc.renameCompany(...a),
  setCompanyStatus: (...a: unknown[]) => svc.setCompanyStatus(...a),
}))

import { AdminRuleError, AdminNotFoundError } from '@/lib/admin/errors'
import { POST as usersPost } from '@/app/api/admin/users/route'
import { PATCH as userPatch } from '@/app/api/admin/users/[id]/route'
import { POST as resetMfa } from '@/app/api/admin/users/[id]/reset-mfa/route'
import { POST as reinvite } from '@/app/api/admin/users/[id]/invite/route'
import { POST as companiesPost } from '@/app/api/admin/companies/route'
import { PATCH as companyPatch } from '@/app/api/admin/companies/[id]/route'

const admin = {
  userId: 'admin1', email: 'a@x.test', name: 'A', sid: 's', companyId: 'c0',
  accountKind: 'STAFF', isPlatformAdmin: true, mfaEnabled: true, mfaVerified: true,
}
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/admin/x', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
  })
const ctx = { params: Promise.resolve({ id: 'u9' }) }
const noParams = { params: Promise.resolve({}) }
const expires = new Date('2030-01-01T00:00:00Z')
const row = { id: 'u9', name: 'N', email: 'n@x.test', pendingInvite: { expiresAt: expires } }

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActiveSession.mockResolvedValue(admin)
  })

  it('POST /api/admin/users returns inviteUrl built from NEXTAUTH_URL', async () => {
    svc.inviteUser.mockResolvedValue({ user: row, token: 'tok123' })
    const res = await usersPost(
      new NextRequest('http://evil.test/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: 'N', email: 'n@x.test', companyId: 'c1' }),
        headers: { 'content-type': 'application/json', origin: 'http://evil.test', host: 'evil.test' },
      }),
      noParams,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.inviteUrl.startsWith('https://crm.example.test/invite/')).toBe(true)
    expect(json.inviteUrl).toContain('tok123')
    expect(json.expiresAt).toBe(expires.toISOString())
    expect(svc.inviteUser).toHaveBeenCalledWith('admin1', { name: 'N', email: 'n@x.test', companyId: 'c1' })
  })

  it('reissue returns inviteUrl and expiresAt', async () => {
    svc.reissueInvite.mockResolvedValue({ token: 'tok9', expiresAt: expires })
    const res = await reinvite(req('POST'), ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.inviteUrl).toBe('https://crm.example.test/invite/tok9')
    expect(json.expiresAt).toBe(expires.toISOString())
    expect(svc.reissueInvite).toHaveBeenCalledWith('admin1', 'u9')
  })

  it('AdminRuleError maps to 400 with its message; AdminNotFoundError to 404', async () => {
    svc.setUserStatus.mockRejectedValue(new AdminRuleError('You cannot deactivate yourself'))
    let res = await userPatch(req('PATCH', { status: 'DEACTIVATED' }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('You cannot deactivate yourself')
    svc.resetUserMfa.mockRejectedValue(new AdminNotFoundError('User not found'))
    res = await resetMfa(req('POST'), ctx)
    expect(res.status).toBe(404)
  })

  it('PATCH accepts exactly one of name or status, else 400', async () => {
    svc.renameUser.mockResolvedValue(row)
    expect((await userPatch(req('PATCH', { name: 'New' }), ctx)).status).toBe(200)
    expect(svc.renameUser).toHaveBeenCalledWith('admin1', 'u9', 'New')
    for (const body of [{}, { name: 'a', status: 'ACTIVE' }, { status: 'BOGUS' }]) {
      expect((await userPatch(req('PATCH', body), ctx)).status).toBe(400)
      expect((await companyPatch(req('PATCH', body), ctx)).status).toBe(400)
    }
    expect(svc.setUserStatus).not.toHaveBeenCalled()
    svc.setCompanyStatus.mockResolvedValue({ id: 'u9' })
    expect((await companyPatch(req('PATCH', { status: 'DEACTIVATED' }), ctx)).status).toBe(200)
    expect(svc.setCompanyStatus).toHaveBeenCalledWith('admin1', 'u9', 'DEACTIVATED')
  })

  it('company create passes the actor and name', async () => {
    svc.createCompany.mockResolvedValue({ id: 'c1', name: 'Acme' })
    const res = await companiesPost(req('POST', { name: 'Acme' }), noParams)
    expect(res.status).toBe(200)
    expect(svc.createCompany).toHaveBeenCalledWith('admin1', 'Acme')
  })

  it('a non-admin staff caller gets 403, a client 404, and no service runs', async () => {
    getActiveSession.mockResolvedValue({ ...admin, isPlatformAdmin: false })
    expect((await usersPost(req('POST', { name: 'N', email: 'n@x.test', companyId: 'c1' }), noParams)).status).toBe(403)
    getActiveSession.mockResolvedValue({ ...admin, accountKind: 'CLIENT', isPlatformAdmin: false })
    expect((await resetMfa(req('POST'), ctx)).status).toBe(404)
    expect(svc.inviteUser).not.toHaveBeenCalled()
    expect(svc.resetUserMfa).not.toHaveBeenCalled()
  })
})
