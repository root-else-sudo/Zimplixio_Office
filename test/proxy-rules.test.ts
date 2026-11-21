import { describe, it, expect } from 'vitest'
import { clientMayVisit, enrollmentMayVisit } from '@/lib/auth-redirect'

describe('proxy allow-lists', () => {
  it('client allow-list matches whole segments', () => {
    for (const p of ['/portal', '/portal/a', '/settings', '/setup-mfa', '/verify-mfa']) expect(clientMayVisit(p)).toBe(true)
    for (const p of ['/', '/departments/product-research', '/portalx', '/admin', '/settingsx']) expect(clientMayVisit(p)).toBe(false)
  })
  it('enrollment allow-list', () => {
    expect(enrollmentMayVisit('/setup-mfa')).toBe(true)
    expect(enrollmentMayVisit('/settings')).toBe(false)
  })
})
