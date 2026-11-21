import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique } } }))

import { isSessionStillActive } from '@/lib/proxy-session'

const claims = { id: 'u1', sid: 's', companyId: 'c1', accountKind: 'STAFF', sessionVersion: 0, mfaVerified: true }
const row = (o: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'user@example.test', name: 'Test User', status: 'ACTIVE', sessionVersion: 0,
  role: 'ADMIN', mfaEnabled: true, companyId: 'c1', company: { kind: 'INTERNAL', status: 'ACTIVE' }, ...o,
})

describe('isSessionStillActive', () => {
  beforeEach(() => findUnique.mockReset())
  it('true for a matching active user', async () => {
    findUnique.mockResolvedValue(row())
    expect(await isSessionStillActive(claims)).toBe(true)
  })
  it('false on sessionVersion mismatch', async () => {
    findUnique.mockResolvedValue(row({ sessionVersion: 1 }))
    expect(await isSessionStillActive(claims)).toBe(false)
  })
  it('false for a deactivated user', async () => {
    findUnique.mockResolvedValue(row({ status: 'DEACTIVATED' }))
    expect(await isSessionStillActive(claims)).toBe(false)
  })
  it('false for a missing user', async () => {
    findUnique.mockResolvedValue(null)
    expect(await isSessionStillActive(claims)).toBe(false)
  })
  it('false without a user id (no DB read)', async () => {
    expect(await isSessionStillActive({ ...claims, id: undefined })).toBe(false)
    expect(findUnique).not.toHaveBeenCalled()
  })
})
