import { beforeEach, describe, expect, it } from 'vitest'
import { resetData, testDb, INTERNAL_COMPANY_ID } from '../helpers/db'
import {
  createCompany, getCompany, listCompanies, renameCompany, setCompanyStatus,
} from '@/lib/admin/companies'
import { AdminNotFoundError, AdminRuleError } from '@/lib/admin/errors'

let adminId: string

beforeEach(async () => {
  await resetData()
  const admin = await testDb.user.create({
    data: { name: 'Admin Person', email: 'admin@example.test', companyId: INTERNAL_COMPANY_ID },
  })
  adminId = admin.id
})

describe('companies', () => {
  it('creates a CLIENT company with an audit row', async () => {
    const c = await createCompany(adminId, '  Test Client Co ')
    expect(c).toMatchObject({ name: 'Test Client Co', kind: 'CLIENT', status: 'ACTIVE', userCount: 0 })
    expect(await testDb.auditLog.findFirst({ where: { action: 'company.created', targetId: c.id } })).not.toBeNull()
  })

  it('rejects an empty or overlong name', async () => {
    await expect(createCompany(adminId, '  ')).rejects.toThrow(AdminRuleError)
    await expect(createCompany(adminId, 'x'.repeat(121))).rejects.toThrow(AdminRuleError)
    expect(await testDb.company.count()).toBe(1)
  })

  it('renames with from/to audit metadata', async () => {
    const c = await createCompany(adminId, 'Old Name')
    const r = await renameCompany(adminId, c.id, ' New Name ')
    expect(r.name).toBe('New Name')
    const row = await testDb.auditLog.findFirst({ where: { action: 'company.renamed', targetId: c.id } })
    expect(row?.metadata).toEqual({ from: 'Old Name', to: 'New Name' })
    await expect(renameCompany(adminId, c.id, '')).rejects.toThrow(AdminRuleError)
    await expect(renameCompany(adminId, 'nope', 'X')).rejects.toThrow(AdminNotFoundError)
  })

  it('deactivating bumps every member sessionVersion', async () => {
    const c = await createCompany(adminId, 'Client A')
    const mk = (email: string) => testDb.user.create({ data: { name: 'U', email, companyId: c.id } })
    const [u1, u2] = [await mk('a@example.test'), await mk('b@example.test')]
    await setCompanyStatus(adminId, c.id, 'DEACTIVATED')
    const after = await testDb.user.findMany({ where: { id: { in: [u1.id, u2.id] } } })
    expect(after.map((u) => u.sessionVersion)).toEqual([u1.sessionVersion + 1, u2.sessionVersion + 1])
    expect((await testDb.company.findUnique({ where: { id: c.id } }))?.status).toBe('DEACTIVATED')
    expect(await testDb.auditLog.count({ where: { action: 'company.deactivated', targetId: c.id } })).toBe(1)
    await setCompanyStatus(adminId, c.id, 'ACTIVE')
    expect(await testDb.auditLog.count({ where: { action: 'company.reactivated', targetId: c.id } })).toBe(1)
  })

  it('refuses to deactivate the internal company', async () => {
    await expect(setCompanyStatus(adminId, INTERNAL_COMPANY_ID, 'DEACTIVATED')).rejects.toThrow(AdminRuleError)
  })

  it('unchanged status writes no audit row', async () => {
    const c = await createCompany(adminId, 'Client B')
    const before = await testDb.auditLog.count()
    await setCompanyStatus(adminId, c.id, 'ACTIVE')
    expect(await testDb.auditLog.count()).toBe(before)
  })

  it('listCompanies counts users and puts internal first', async () => {
    const z = await createCompany(adminId, 'Zeta Co')
    await createCompany(adminId, 'Alpha Co')
    await testDb.user.create({ data: { name: 'U', email: 'z@example.test', companyId: z.id } })
    const rows = await listCompanies()
    expect(rows.map((r) => r.name)).toEqual(['Zimplixio', 'Alpha Co', 'Zeta Co'])
    expect(rows.map((r) => r.userCount)).toEqual([1, 0, 1])
  })

  it('getCompany returns members and throws on unknown id', async () => {
    const c = await getCompany(INTERNAL_COMPANY_ID)
    expect(c.users).toEqual([expect.objectContaining({ email: 'admin@example.test', mfaEnabled: false })])
    await expect(getCompany('missing')).rejects.toThrow(AdminNotFoundError)
  })
})
