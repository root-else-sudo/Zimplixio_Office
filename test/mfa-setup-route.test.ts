import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getActiveSession = vi.fn()
const findUnique = vi.fn()
const update = vi.fn()
const createTotpFactor = vi.fn()
vi.mock('@/lib/session-guard', () => ({ getActiveSession: () => getActiveSession() }))
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'u1', sid: 's', name: 'N', email: 'e@x.test' } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: (a: unknown) => findUnique(a), update: (a: unknown) => update(a) } } }))
vi.mock('@/lib/twilio', () => ({
  createTotpFactor: (...a: unknown[]) => createTotpFactor(...a),
  verifyTotpSetup: vi.fn(),
}))

import { POST } from '@/app/api/mfa/setup/route'

const active = {
  userId: 'u1', email: 'e@x.test', name: 'N', sid: 's', companyId: 'c1',
  accountKind: 'STAFF', isPlatformAdmin: false, mfaEnabled: false, mfaVerified: false,
}
const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/mfa/setup', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
    }),
    { params: Promise.resolve({}) },
  )

describe('POST /api/mfa/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActiveSession.mockResolvedValue(active)
  })

  it('refuses both actions with 403 when already enrolled, and writes nothing', async () => {
    findUnique.mockResolvedValue({ mfaEnabled: true })
    for (const body of [{ action: 'create' }, { action: 'verify', code: '123456' }]) {
      const res = await call(body)
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe('MFA is already set up for this account')
    }
    expect(createTotpFactor).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('allows create for an unenrolled user', async () => {
    findUnique.mockResolvedValue({ mfaEnabled: false })
    createTotpFactor.mockResolvedValue({ sid: 'YF1', binding: { uri: 'otpauth://x' } })
    const res = await call({ action: 'create' })
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
