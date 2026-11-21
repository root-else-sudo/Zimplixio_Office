import { beforeEach, describe, expect, it } from 'vitest'
import { resetData, testDb, INTERNAL_COMPANY_ID } from '../helpers/db'
import { recordAudit, listActivity } from '@/lib/admin/audit'

beforeEach(resetData)

describe('audit', () => {
  it('recordAudit writes inside the caller transaction and rolls back with it', async () => {
    await expect(testDb.$transaction(async (tx) => {
      await recordAudit(tx, { actorId: null, action: 'company.created', targetType: 'Company', targetId: 'x' })
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await testDb.auditLog.count()).toBe(0)
  })

  it('listActivity returns newest first with actor email', async () => {
    const actor = await testDb.user.create({
      data: { name: 'Admin Person', email: 'admin@example.test', companyId: INTERNAL_COMPANY_ID },
    })
    await testDb.auditLog.create({ data: { actorId: actor.id, action: 'user.invited', targetType: 'User', targetId: 'u1', createdAt: new Date('2026-01-01T00:00:00Z') } })
    await testDb.auditLog.create({ data: { actorId: actor.id, action: 'user.renamed', targetType: 'User', targetId: 'u2', createdAt: new Date('2026-02-01T00:00:00Z') } })
    const rows = await listActivity()
    expect(rows.map((r) => r.action)).toEqual(['user.renamed', 'user.invited'])
    expect(rows[0].actorEmail).toBe('admin@example.test')
    expect(rows[0].actorName).toBe('Admin Person')
    expect(await listActivity({ limit: 1 })).toHaveLength(1)
  })
})
