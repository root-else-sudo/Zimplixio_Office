import { describe, it, expect } from 'vitest'
import { normalizeEmail, assertAccountRules, accountKindOf, AccountRuleError } from '@/lib/accounts'

describe('account rules', () => {
  it('normalizes email', () =>
    expect(normalizeEmail('  Owner@Zimplixio.COM ')).toBe('owner@zimplixio.com'))
  it('staff must use the staff domain', () =>
    expect(() =>
      assertAccountRules({ email: 'a@gmail.com', companyKind: 'INTERNAL', role: 'REVIEWER' }),
    ).toThrow(AccountRuleError))
  it('clients may use any domain but not the staff one', () => {
    expect(() =>
      assertAccountRules({ email: 'a@gmail.com', companyKind: 'CLIENT', role: 'REVIEWER' }),
    ).not.toThrow()
    expect(() =>
      assertAccountRules({ email: 'a@ZIMPLIXIO.com', companyKind: 'CLIENT', role: 'REVIEWER' }),
    ).toThrow(AccountRuleError)
  })
  it('only staff can be ADMIN', () =>
    expect(() =>
      assertAccountRules({ email: 'a@acme.example', companyKind: 'CLIENT', role: 'ADMIN' }),
    ).toThrow(AccountRuleError))
  it('derives kind', () => {
    expect(accountKindOf('INTERNAL')).toBe('STAFF')
    expect(accountKindOf('CLIENT')).toBe('CLIENT')
  })
})
