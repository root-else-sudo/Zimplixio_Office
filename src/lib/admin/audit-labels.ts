import type { AuditAction } from '@/lib/admin/audit'

export const AUDIT_LABELS: Record<AuditAction, string> = {
  'company.created': 'Created company',
  'company.renamed': 'Renamed company',
  'company.deactivated': 'Deactivated company',
  'company.reactivated': 'Reactivated company',
  'user.invited': 'Invited user',
  'user.renamed': 'Renamed user',
  'user.deactivated': 'Deactivated user',
  'user.reactivated': 'Reactivated user',
  'mfa.reset': 'Reset MFA',
  'invite.issued': 'Issued invite link',
  'invite.accepted': 'Accepted invite',
}

export function auditLabel(action: string): string {
  return (AUDIT_LABELS as Record<string, string>)[action] ?? action
}
