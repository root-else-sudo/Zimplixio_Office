import type { CompanyKind, Role } from '@prisma/client'

export const STAFF_DOMAIN = 'zimplixio.com'

export type AccountKind = 'STAFF' | 'CLIENT'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function accountKindOf(companyKind: CompanyKind): AccountKind {
  return companyKind === 'INTERNAL' ? 'STAFF' : 'CLIENT'
}

export class AccountRuleError extends Error {}

/** Throws AccountRuleError if the email/company/role combination is not allowed. */
export function assertAccountRules(input: {
  email: string
  companyKind: CompanyKind
  role: Role
}): void {
  const onStaffDomain = normalizeEmail(input.email).endsWith(`@${STAFF_DOMAIN}`)
  const kind = accountKindOf(input.companyKind)

  if (kind === 'STAFF' && !onStaffDomain) {
    throw new AccountRuleError(`Staff accounts must use an @${STAFF_DOMAIN} email.`)
  }
  if (kind === 'CLIENT' && onStaffDomain) {
    throw new AccountRuleError(`Client accounts cannot use an @${STAFF_DOMAIN} email.`)
  }
  if (kind === 'CLIENT' && input.role === 'ADMIN') {
    throw new AccountRuleError('Client accounts cannot be ADMIN.')
  }
}
