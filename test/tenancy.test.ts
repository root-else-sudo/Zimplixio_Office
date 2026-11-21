import { beforeEach, describe, expect, it } from 'vitest'
import { resetData, testDb } from './helpers/db'
import {
  buildTenantHandle,
  scopedClient,
  tenantDb,
  TenantScopeError,
  type TenantContext,
} from '@/lib/tenancy'

const A = 'company-a'
const B = 'company-b'
let userOfB = ''

function newUser(over: { companyId?: string } = {}) {
  const n = Math.random().toString(36).slice(2)
  return { name: 'New User', email: `new-${n}@example.test`, companyId: A, ...over }
}

beforeEach(async () => {
  await resetData()
  await testDb.company.create({ data: { id: A, name: 'Company A', kind: 'CLIENT' } })
  await testDb.company.create({ data: { id: B, name: 'Company B', kind: 'CLIENT' } })
  await testDb.user.create({ data: { name: 'User A', email: 'a@example.test', companyId: A } })
  userOfB = (await testDb.user.create({ data: { name: 'User B', email: 'b@example.test', companyId: B } })).id
})

const staffCtx: TenantContext = { userId: 'u1', companyId: 'internal-zimplixio', accountKind: 'STAFF', isPlatformAdmin: false }
const clientCtx: TenantContext = { userId: 'u2', companyId: A, accountKind: 'CLIENT', isPlatformAdmin: false }

describe('scopedClient', () => {
  it('findMany only returns the scoped company rows', async () =>
    expect((await scopedClient(testDb, A, ['User']).user.findMany()).map((u) => u.companyId)).toEqual([A]))
  it('findUnique of another company row returns null', async () =>
    expect(await scopedClient(testDb, A, ['User']).user.findUnique({ where: { id: userOfB } })).toBeNull())
  it('update/delete of another company row affects nothing', async () => {
    await expect(scopedClient(testDb, A, ['User']).user.update({ where: { id: userOfB }, data: { name: 'x' } })).rejects.toThrow()
    expect((await scopedClient(testDb, A, ['User']).user.deleteMany({ where: { id: userOfB } })).count).toBe(0)
  })
  it('create forces companyId and rejects a foreign one', async () => {
    expect((await scopedClient(testDb, A, ['User']).user.create({ data: newUser() })).companyId).toBe(A)
    await expect(scopedClient(testDb, A, ['User']).user.create({ data: newUser({ companyId: B }) })).rejects.toThrow(TenantScopeError)
  })
  it('count/aggregate are scoped', async () => {
    expect(await scopedClient(testDb, A, ['User']).user.count()).toBe(1)
    expect((await scopedClient(testDb, A, ['User']).user.aggregate({ _count: true }))._count).toBe(1)
  })
  it('a caller-supplied foreign where.companyId cannot widen the scope', async () =>
    expect(await scopedClient(testDb, A, ['User']).user.findMany({ where: { companyId: B } })).toEqual([]))
  it('unsupported operations on a listed model throw', async () =>
    await expect(scopedClient(testDb, A, ['User']).user.createManyAndReturn({ data: [newUser()] })).rejects.toThrow(TenantScopeError))
  it('models not in the list are untouched', async () =>
    expect(await scopedClient(testDb, A, []).user.count()).toBeGreaterThan(1))
})

describe('scopedClient hardening', () => {
  const db = () => scopedClient(testDb, A, ['User'])
  const ownId = async () => (await testDb.user.findFirstOrThrow({ where: { companyId: A } })).id
  const countB = () => testDb.user.count({ where: { companyId: B } })

  it('rejects cursor (scopedClient)', async () =>
    await expect(db().user.findMany({ cursor: { id: userOfB } })).rejects.toThrow(TenantScopeError))
  it('update cannot move a row to another company', async () => {
    const id = await ownId()
    await expect(db().user.update({ where: { id }, data: { companyId: B } })).rejects.toThrow(TenantScopeError)
    await expect(db().user.update({ where: { id }, data: { company: { connect: { id: B } } } })).rejects.toThrow(TenantScopeError)
    expect(await countB()).toBe(1)
    expect((await testDb.user.findUniqueOrThrow({ where: { id } })).companyId).toBe(A)
  })
  it('updateMany cannot change companyId', async () => {
    await expect(db().user.updateMany({ data: { companyId: B } })).rejects.toThrow(TenantScopeError)
    expect(await countB()).toBe(1)
  })
  it('upsert scopes where, forces create companyId, rejects companyId in update', async () => {
    const created = await db().user.upsert({
      where: { email: 'up@example.test' },
      create: { name: 'Up', email: 'up@example.test' } as never,
      update: { name: 'Up2' },
    })
    expect(created.companyId).toBe(A)
    // B's row is invisible through A's scope: whatever upsert does (reject or no-op), B's row must be untouched
    await db().user.upsert({ where: { email: 'b@example.test' }, create: { name: 'x', email: 'b@example.test' } as never, update: { name: 'hijack' } }).catch(() => undefined)
    expect((await testDb.user.findUniqueOrThrow({ where: { id: userOfB } })).name).toBe('User B')
    await expect(
      db().user.upsert({ where: { email: 'up@example.test' }, create: { name: 'x', email: 'up@example.test' } as never, update: { companyId: B } }),
    ).rejects.toThrow(TenantScopeError)
  })
  it('createMany with an array forces companyId', async () => {
    await db().user.createMany({ data: [{ name: 'M1', email: 'm1@example.test' }, { name: 'M2', email: 'm2@example.test' }] as never })
    expect(await testDb.user.count({ where: { companyId: A } })).toBe(3)
    await expect(db().user.createMany({ data: [{ name: 'M3', email: 'm3@example.test', companyId: B }] })).rejects.toThrow(TenantScopeError)
  })
  it('rejects include and relation select, allows scalar select', async () => {
    await expect(db().user.findMany({ include: { company: true } })).rejects.toThrow(TenantScopeError)
    await expect(db().user.findMany({ select: { company: true } })).rejects.toThrow(TenantScopeError)
    const rows = await db().user.findMany({ select: { id: true, name: true } })
    expect(rows).toHaveLength(1)
  })
  it('rejects nested relation writes in data', async () => {
    await expect(
      db().user.create({ data: { name: 'N', email: 'n@example.test', company: { create: { name: 'Evil' } } } as never }),
    ).rejects.toThrow(TenantScopeError)
  })
  it('findUnique with where id plus the same companyId works', async () => {
    const id = await ownId()
    expect(await db().user.findUnique({ where: { id, companyId: A } })).not.toBeNull()
  })
})

describe('buildTenantHandle', () => {
  const handle = () => buildTenantHandle(testDb, A, ['User'])
  it('exposes the delegate without escape hatches', async () => {
    const h = handle()
    expect(h.user).toBeDefined()
    expect('$parent' in h.user).toBe(false)
    expect(Object.keys(h.user).filter((k) => k.startsWith('$'))).toEqual([])
    expect((h as Record<string, unknown>).$queryRaw).toBeUndefined()
    const row = await h.user.findUnique({ where: { email: 'a@example.test' } })
    expect(row).not.toBeNull()
    expect(typeof (row as unknown as Record<string, unknown>).company).not.toBe('function')
    expect(typeof (h.user.findUnique({ where: { email: 'a@example.test' } }) as unknown as Record<string, unknown>).company).not.toBe('function')
  })
  it('findMany only returns company A rows', async () =>
    expect((await handle().user.findMany()).map((u) => u.companyId)).toEqual([A]))
  it('rejects cursor (handle)', async () =>
    await expect(handle().user.findMany({ cursor: { id: userOfB } })).rejects.toThrow(TenantScopeError))
})

describe('relation paths in where', () => {
  it('are rejected', async () => {
    await expect(
      scopedClient(testDb, A, ['User']).user.count({ where: { company: { users: { some: { name: { startsWith: 'a' } } } } } }),
    ).rejects.toThrow(TenantScopeError)
  })
})

describe('tenantDb', () => {
  it('staff must name a client to act for', () => expect(() => tenantDb(staffCtx)).toThrow(TenantScopeError))
  it('clients cannot act for another company', () =>
    expect(() => tenantDb(clientCtx, { actingForCompanyId: B })).toThrow(TenantScopeError))
  it('returns only tenant delegates, never raw query access', () => {
    for (const handle of [tenantDb(staffCtx, { actingForCompanyId: A }), tenantDb(clientCtx)]) {
      expect(typeof handle).toBe('object')
      expect(handle).not.toHaveProperty('$queryRaw')
      expect(handle).not.toHaveProperty('$executeRaw')
      expect(handle).not.toHaveProperty('$transaction')
      expect(handle).not.toHaveProperty('company')
      expect(handle).not.toHaveProperty('user')
    }
  })
})
