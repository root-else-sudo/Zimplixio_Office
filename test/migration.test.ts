import { describe, it, expect, beforeEach } from 'vitest'
import { testDb, resetData } from './helpers/db'

describe('access foundation migration', () => {
  beforeEach(resetData)

  it('has exactly one INTERNAL company after migration', async () =>
    expect(await testDb.company.count({ where: { kind: 'INTERNAL' } })).toBe(1))
  it('rejects a second INTERNAL company (partial unique index)', async () =>
    await expect(testDb.company.create({ data: { name: 'Dup', kind: 'INTERNAL' } })).rejects.toThrow())
  it('creates the Company_single_internal partial unique index', async () => {
    const rows = await testDb.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'Company_single_internal'`
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toContain('UNIQUE')
    expect(rows[0].indexdef).toContain('INTERNAL')
  })
})
