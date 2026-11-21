import { beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { resetData, testDb, INTERNAL_COMPANY_ID } from '../helpers/db'
import { inviteUser } from '@/lib/admin/users'
import { hashInviteToken } from '@/lib/admin/invite-tokens'
import { acceptInvite, getInviteState, InviteInvalidError, InvitePasswordError } from '@/lib/admin/accept-invite'

const PW = 'a-long-enough-password'
let adminId: string
let clientCo: string

async function freshInvite(email = 'client@example.com') {
  return inviteUser(adminId, { name: 'Client One', email, companyId: clientCo })
}

beforeEach(async () => {
  await resetData()
  adminId = (await testDb.user.create({
    data: { name: 'Admin Person', email: 'admin@zimplixio.com', role: 'ADMIN', companyId: INTERNAL_COMPANY_ID },
  })).id
  clientCo = (await testDb.company.create({ data: { name: 'Client Co', kind: 'CLIENT' } })).id
})

describe('accept invite', () => {
  it('valid invite: state ok, accept sets password + ACTIVE, marks used, audits', async () => {
    const { user, token } = await freshInvite()
    expect(await getInviteState(token)).toEqual({ ok: true, name: 'Client One', email: 'client@example.com' })
    expect(await acceptInvite(token, PW)).toEqual({ email: 'client@example.com' })
    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row.status).toBe('ACTIVE')
    expect(await bcrypt.compare(PW, row.passwordHash!)).toBe(true)
    const inv = await testDb.userInvite.findUniqueOrThrow({ where: { tokenHash: hashInviteToken(token) } })
    expect(inv.usedAt).not.toBeNull()
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: 'invite.accepted' } })
    expect(audit).toMatchObject({ actorId: user.id, targetId: user.id })
    expect(JSON.stringify(audit.metadata)).not.toContain(token)
    expect((await getInviteState(token)).ok).toBe(false)
  })

  it('accept is single-use and race-safe', async () => {
    const { token } = await freshInvite()
    const results = await Promise.allSettled([acceptInvite(token, PW), acceptInvite(token, PW)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(InviteInvalidError)
    expect(await testDb.auditLog.count({ where: { action: 'invite.accepted' } })).toBe(1)
  })

  it('expired / revoked / used / unknown tokens all throw InviteInvalidError', async () => {
    const a = await freshInvite('a@example.com')
    await testDb.userInvite.updateMany({ where: { tokenHash: hashInviteToken(a.token) }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const b = await freshInvite('b@example.com')
    await testDb.userInvite.updateMany({ where: { tokenHash: hashInviteToken(b.token) }, data: { revokedAt: new Date() } })
    const c = await freshInvite('c@example.com')
    await acceptInvite(c.token, PW)
    for (const t of [a.token, b.token, c.token, 'nope']) {
      expect(await getInviteState(t)).toEqual({ ok: false })
      await expect(acceptInvite(t, PW)).rejects.toThrow(InviteInvalidError)
    }
  })

  it('a deactivated user or company makes the invite invalid and sets no password', async () => {
    const a = await freshInvite('a@example.com')
    await testDb.user.update({ where: { id: a.user.id }, data: { status: 'DEACTIVATED' } })
    expect(await getInviteState(a.token)).toEqual({ ok: false })
    await expect(acceptInvite(a.token, PW)).rejects.toThrow(InviteInvalidError)
    expect((await testDb.user.findUniqueOrThrow({ where: { id: a.user.id } })).passwordHash).toBeNull()

    const co2 = (await testDb.company.create({ data: { name: 'Other Co', kind: 'CLIENT' } })).id
    const b = await inviteUser(adminId, { name: 'B', email: 'b@example.com', companyId: co2 })
    await testDb.company.update({ where: { id: co2 }, data: { status: 'DEACTIVATED' } })
    expect(await getInviteState(b.token)).toEqual({ ok: false })
    await expect(acceptInvite(b.token, PW)).rejects.toThrow(InviteInvalidError)
    const row = await testDb.user.findUniqueOrThrow({ where: { id: b.user.id } })
    expect(row).toMatchObject({ passwordHash: null, status: 'INVITED' })
    // rollback: the invite was not burned
    expect((await testDb.userInvite.findUniqueOrThrow({ where: { tokenHash: hashInviteToken(b.token) } })).usedAt).toBeNull()
  })

  it('a weak password throws InvitePasswordError and does NOT consume the invite', async () => {
    const { token } = await freshInvite()
    await expect(acceptInvite(token, 'short')).rejects.toThrow(InvitePasswordError)
    await expect(acceptInvite(token, 'CLIENT@example.com')).rejects.toThrow(InvitePasswordError)
    expect((await getInviteState(token)).ok).toBe(true)
    await expect(acceptInvite(token, PW)).resolves.toEqual({ email: 'client@example.com' })
  })
})
