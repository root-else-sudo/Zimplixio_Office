import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetData, testDb, INTERNAL_COMPANY_ID } from '../helpers/db'
import {
  getUser, inviteUser, listUsers, renameUser, reissueInvite, resetUserMfa, setUserStatus,
} from '@/lib/admin/users'
import { AdminNotFoundError, AdminRuleError } from '@/lib/admin/errors'
import { INVITE_TTL_MS, hashInviteToken } from '@/lib/admin/invite-tokens'

let adminId: string
let clientCo: string

beforeEach(async () => {
  await resetData()
  const admin = await testDb.user.create({
    data: { name: 'Admin Person', email: 'admin@zimplixio.com', role: 'ADMIN', companyId: INTERNAL_COMPANY_ID },
  })
  adminId = admin.id
  clientCo = (await testDb.company.create({ data: { name: 'Client Co', kind: 'CLIENT' } })).id
})

describe('users', () => {
  it('invites a client user: INVITED, no password, hashed token stored, raw token returned', async () => {
    const { user, token } = await inviteUser(adminId, { name: 'Client One', email: 'Client@Example.com', companyId: clientCo })
    expect(user).toMatchObject({ email: 'client@example.com', status: 'INVITED', mfaEnabled: false, isPlatformAdmin: false })
    expect(user.pendingInvite).not.toBeNull()
    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row).toMatchObject({ passwordHash: null, role: 'REVIEWER' })
    const inv = await testDb.userInvite.findFirstOrThrow({ where: { userId: user.id } })
    expect(inv.tokenHash).toBe(hashInviteToken(token))
    expect(inv.tokenHash).not.toBe(token)
    expect(await testDb.auditLog.count({ where: { action: 'user.invited' } })).toBe(1)
    expect(await testDb.auditLog.count({ where: { action: 'invite.issued' } })).toBe(1)
  })

  it('staff domain rules apply', async () => {
    await expect(inviteUser(adminId, { name: 'X', email: 'x@zimplixio.com', companyId: clientCo })).rejects.toThrow(AdminRuleError)
    await expect(inviteUser(adminId, { name: 'X', email: 'x@gmail.com', companyId: INTERNAL_COMPANY_ID })).rejects.toThrow(AdminRuleError)
  })

  it('rejects a bad name, a duplicate email and an inactive or missing company', async () => {
    await expect(inviteUser(adminId, { name: ' ', email: 'a@example.com', companyId: clientCo })).rejects.toThrow(AdminRuleError)
    await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    await expect(inviteUser(adminId, { name: 'B', email: 'A@example.com', companyId: clientCo })).rejects.toThrow('An account with that email already exists')
    const dead = await testDb.company.create({ data: { name: 'Dead', kind: 'CLIENT', status: 'DEACTIVATED' } })
    await expect(inviteUser(adminId, { name: 'C', email: 'c@example.com', companyId: dead.id })).rejects.toThrow(AdminRuleError)
    await expect(inviteUser(adminId, { name: 'C', email: 'c@example.com', companyId: 'nope' })).rejects.toThrow(AdminNotFoundError)
  })

  it('audit metadata never contains the token or its hash', async () => {
    const { token } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    const rows = await testDb.auditLog.findMany()
    for (const r of rows) {
      const s = JSON.stringify(r.metadata)
      expect(s).not.toContain(token.slice(0, 10))
      expect(s).not.toContain(hashInviteToken(token).slice(0, 10))
    }
  })

  it('lists, gets and renames', async () => {
    const { user } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    expect((await listUsers({ companyId: clientCo })).map((u) => u.id)).toEqual([user.id])
    expect((await listUsers()).length).toBe(2)
    expect((await getUser(adminId)).isPlatformAdmin).toBe(true)
    await expect(getUser('nope')).rejects.toThrow(AdminNotFoundError)
    const r = await renameUser(adminId, user.id, ' New ')
    expect(r.name).toBe('New')
    expect(await testDb.auditLog.count({ where: { action: 'user.renamed' } })).toBe(1)
    await expect(renameUser(adminId, user.id, '')).rejects.toThrow(AdminRuleError)
  })

  it('deactivate bumps sessionVersion and revokes pending invites; self-deactivate refused', async () => {
    const { user } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    const before = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
    const r = await setUserStatus(adminId, user.id, 'DEACTIVATED')
    expect(r.status).toBe('DEACTIVATED')
    const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.sessionVersion).toBe(before.sessionVersion + 1)
    expect((await testDb.userInvite.findFirstOrThrow({ where: { userId: user.id } })).revokedAt).not.toBeNull()
    expect(r.pendingInvite).toBeNull()
    await expect(setUserStatus(adminId, adminId, 'DEACTIVATED')).rejects.toThrow(AdminRuleError)
  })

  it('reactivate restores INVITED when no password was ever set, ACTIVE otherwise', async () => {
    const { user } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    await setUserStatus(adminId, user.id, 'DEACTIVATED')
    expect((await setUserStatus(adminId, user.id, 'ACTIVE')).status).toBe('INVITED')
    await testDb.user.update({ where: { id: user.id }, data: { passwordHash: 'x' } })
    await setUserStatus(adminId, user.id, 'DEACTIVATED')
    expect((await setUserStatus(adminId, user.id, 'ACTIVE')).status).toBe('ACTIVE')
    expect(await testDb.auditLog.count({ where: { action: 'user.reactivated' } })).toBe(2)
  })

  it('resetUserMfa clears MFA, bumps version, calls deleteFactor; failure does not throw; self refused', async () => {
    const u = await testDb.user.create({
      data: { name: 'M', email: 'm@example.com', companyId: clientCo, mfaEnabled: true, mfaSecret: 'FACTOR_SID', status: 'ACTIVE' },
    })
    const del = vi.fn().mockResolvedValue(undefined)
    const r = await resetUserMfa(adminId, u.id, { deleteFactor: del })
    expect(r.mfaEnabled).toBe(false)
    const row = await testDb.user.findUniqueOrThrow({ where: { id: u.id } })
    expect(row).toMatchObject({ mfaEnabled: false, mfaSecret: null, sessionVersion: u.sessionVersion + 1 })
    expect(del).toHaveBeenCalledWith(u.id, 'FACTOR_SID')
    expect(await testDb.auditLog.count({ where: { action: 'mfa.reset' } })).toBe(1)

    const u2 = await testDb.user.create({
      data: { name: 'N', email: 'n@example.com', companyId: clientCo, mfaEnabled: true, mfaSecret: 'S2' },
    })
    const bad = vi.fn().mockRejectedValue(new Error('twilio down'))
    await expect(resetUserMfa(adminId, u2.id, { deleteFactor: bad })).resolves.toBeDefined()
    expect(bad).toHaveBeenCalled()
    await expect(resetUserMfa(adminId, adminId, { deleteFactor: del })).rejects.toThrow(AdminRuleError)
  })

  it('reissueInvite revokes the previous token (old hash now has revokedAt)', async () => {
    const { user, token } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    const r = await reissueInvite(adminId, user.id)
    expect(r.token).not.toBe(token)
    const old = await testDb.userInvite.findUniqueOrThrow({ where: { tokenHash: hashInviteToken(token) } })
    expect(old.revokedAt).not.toBeNull()
    const fresh = await testDb.userInvite.findUniqueOrThrow({ where: { tokenHash: hashInviteToken(r.token) } })
    expect(fresh.revokedAt).toBeNull()
    expect(fresh.expiresAt.getTime()).toBe(r.expiresAt.getTime())
    expect(await testDb.auditLog.count({ where: { action: 'invite.issued' } })).toBe(2)
  })

  it('reissueInvite refuses ACTIVE users and missing users', async () => {
    const u = await testDb.user.create({ data: { name: 'Z', email: 'z@example.com', companyId: clientCo, status: 'ACTIVE' } })
    await expect(reissueInvite(adminId, u.id)).rejects.toThrow(AdminRuleError)
    await expect(reissueInvite(adminId, 'nope')).rejects.toThrow(AdminNotFoundError)
  })

  it('concurrent invites for the same email: one wins, the other gets AdminRuleError', async () => {
    const input = { name: 'R', email: 'race@example.com', companyId: clientCo }
    const results = await Promise.allSettled([inviteUser(adminId, input), inviteUser(adminId, input)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rej = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rej.reason).toBeInstanceOf(AdminRuleError)
    expect(rej.reason.message).toBe('An account with that email already exists')
  })

  it('reissueInvite refuses when the company is deactivated', async () => {
    const { user } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
    await testDb.company.update({ where: { id: clientCo }, data: { status: 'DEACTIVATED' } })
    await expect(reissueInvite(adminId, user.id)).rejects.toThrow(AdminRuleError)
  })

  it('does not call deleteFactor when the user had no mfaSecret', async () => {
    const u = await testDb.user.create({ data: { name: 'P', email: 'p@example.com', companyId: clientCo } })
    const del = vi.fn()
    await resetUserMfa(adminId, u.id, { deleteFactor: del })
    expect(del).not.toHaveBeenCalled()
  })

  it('invite expiry is now + INVITE_TTL_MS', async () => {
    const before = Date.now()
    const { user } = await inviteUser(adminId, { name: 'T', email: 't@example.com', companyId: clientCo })
    const inv = await testDb.userInvite.findFirstOrThrow({ where: { userId: user.id } })
    expect(Math.abs(inv.expiresAt.getTime() - (before + INVITE_TTL_MS))).toBeLessThan(5000)
  })
})
