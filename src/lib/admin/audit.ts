import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type AuditAction =
  | 'company.created' | 'company.renamed' | 'company.deactivated' | 'company.reactivated'
  | 'user.invited' | 'user.renamed' | 'user.deactivated' | 'user.reactivated'
  | 'mfa.reset' | 'invite.issued' | 'invite.accepted'

export interface AuditEntry {
  actorId: string | null
  action: AuditAction
  targetType: 'Company' | 'User'
  targetId: string
  companyId?: string | null
  /** Never put passwords, tokens, token hashes or MFA secrets here. */
  metadata?: Record<string, string | number | boolean | null>
}

export interface ActivityRow {
  id: string
  action: string
  targetType: string
  targetId: string
  companyId: string | null
  metadata: Prisma.JsonValue
  createdAt: Date
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
}

export async function recordAudit(tx: Prisma.TransactionClient, e: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      companyId: e.companyId ?? null,
      metadata: e.metadata ?? {},
    },
  })
}

export async function listActivity(opts: { limit?: number } = {}): Promise<ActivityRow[]> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
    include: { actor: { select: { name: true, email: true } } },
  })
  return rows.map(({ actor, ...r }) => ({
    ...r,
    actorName: actor?.name ?? null,
    actorEmail: actor?.email ?? null,
  }))
}
