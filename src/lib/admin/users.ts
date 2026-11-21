import { Prisma } from '@prisma/client'
import type { CompanyKind, UserStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { recordAudit } from '@/lib/admin/audit'
import { AdminNotFoundError, AdminRuleError } from '@/lib/admin/errors'
import { INVITE_TTL_MS, generateInviteToken } from '@/lib/admin/invite-tokens'
import { AccountRuleError, assertAccountRules, normalizeEmail } from '@/lib/accounts'

export type UserRow = {
  id: string
  name: string
  email: string
  status: UserStatus
  mfaEnabled: boolean
  isPlatformAdmin: boolean
  company: { id: string; name: string; kind: CompanyKind }
  createdAt: Date
  pendingInvite: { expiresAt: Date } | null
}

const MAX_NAME = 120

function cleanName(raw: string): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > MAX_NAME) {
    throw new AdminRuleError(`Name must be 1-${MAX_NAME} characters`)
  }
  return name
}

const userInclude = {
  company: { select: { id: true, name: true, kind: true } },
  invites: {
    where: { usedAt: null, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.UserInclude

type UserWithRels = Prisma.UserGetPayload<{ include: typeof userInclude }>

function toRow(u: UserWithRels): UserRow {
  const now = Date.now()
  const live = u.invites.find((i) => i.expiresAt.getTime() > now)
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    mfaEnabled: u.mfaEnabled,
    isPlatformAdmin: u.role === 'ADMIN' && u.company.kind === 'INTERNAL',
    company: u.company,
    createdAt: u.createdAt,
    pendingInvite: live ? { expiresAt: live.expiresAt } : null,
  }
}

export async function listUsers(filter?: { companyId?: string }): Promise<UserRow[]> {
  const rows = await prisma.user.findMany({
    where: filter?.companyId ? { companyId: filter.companyId } : undefined,
    include: userInclude,
    orderBy: [{ name: 'asc' }],
  })
  return rows.map(toRow)
}

export async function getUser(id: string): Promise<UserRow> {
  const u = await prisma.user.findUnique({ where: { id }, include: userInclude })
  if (!u) throw new AdminNotFoundError('User not found')
  return toRow(u)
}

async function issueInvite(
  tx: Prisma.TransactionClient, actorId: string, user: { id: string; companyId: string },
): Promise<{ token: string; expiresAt: Date }> {
  const now = new Date()
  await tx.userInvite.updateMany({
    where: { userId: user.id, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  })
  const { token, tokenHash } = generateInviteToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await tx.userInvite.create({ data: { userId: user.id, tokenHash, expiresAt, createdById: actorId } })
  await recordAudit(tx, {
    actorId, action: 'invite.issued', targetType: 'User', targetId: user.id, companyId: user.companyId,
    metadata: { expiresAt: expiresAt.toISOString() },
  })
  return { token, expiresAt }
}

export async function inviteUser(
  actorId: string, input: { name: string; email: string; companyId: string },
): Promise<{ user: UserRow; token: string }> {
  const name = cleanName(input.name)
  const email = normalizeEmail(input.email)
  let created: { id: string; token: string }
  try {
    created = await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: input.companyId } })
    if (!company) throw new AdminNotFoundError('Company not found')
    if (company.status !== 'ACTIVE') throw new AdminRuleError('That company is deactivated')
    try {
      assertAccountRules({ email, companyKind: company.kind, role: 'REVIEWER' })
    } catch (e) {
      if (e instanceof AccountRuleError) throw new AdminRuleError(e.message)
      throw e
    }
    if (await tx.user.findUnique({ where: { email } })) {
      throw new AdminRuleError('An account with that email already exists')
    }
    const user = await tx.user.create({
      data: {
        name, email, role: 'REVIEWER', status: 'INVITED', passwordHash: null,
        mfaEnabled: false, companyId: company.id,
      },
    })
    await recordAudit(tx, {
      actorId, action: 'user.invited', targetType: 'User', targetId: user.id, companyId: company.id,
      metadata: { email, name },
    })
    const issued = await issueInvite(tx, actorId, user)
    return { id: user.id, token: issued.token }
    })
  } catch (e) {
    // Concurrent invite for the same email: the unique index wins the race.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AdminRuleError('An account with that email already exists')
    }
    throw e
  }
  return { user: await getUser(created.id), token: created.token }
}

export async function renameUser(actorId: string, id: string, name: string): Promise<UserRow> {
  const clean = cleanName(name)
  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } })
    if (!existing) throw new AdminNotFoundError('User not found')
    await tx.user.update({ where: { id }, data: { name: clean } })
    await recordAudit(tx, {
      actorId, action: 'user.renamed', targetType: 'User', targetId: id, companyId: existing.companyId,
      metadata: { from: existing.name, to: clean },
    })
  })
  return getUser(id)
}

export async function setUserStatus(
  actorId: string, id: string, status: 'ACTIVE' | 'DEACTIVATED',
): Promise<UserRow> {
  if (status === 'DEACTIVATED' && actorId === id) {
    throw new AdminRuleError('You cannot deactivate your own account')
  }
  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } })
    if (!existing) throw new AdminNotFoundError('User not found')
    if (status === 'DEACTIVATED') {
      if (existing.status === 'DEACTIVATED') return
      await tx.user.update({
        where: { id }, data: { status: 'DEACTIVATED', sessionVersion: { increment: 1 } },
      })
      await tx.userInvite.updateMany({
        where: { userId: id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() },
      })
      await recordAudit(tx, {
        actorId, action: 'user.deactivated', targetType: 'User', targetId: id, companyId: existing.companyId,
      })
    } else {
      if (existing.status !== 'DEACTIVATED') return
      const next: UserStatus = existing.passwordHash ? 'ACTIVE' : 'INVITED'
      await tx.user.update({ where: { id }, data: { status: next } })
      await recordAudit(tx, {
        actorId, action: 'user.reactivated', targetType: 'User', targetId: id, companyId: existing.companyId,
        metadata: { status: next },
      })
    }
  })
  return getUser(id)
}

export async function resetUserMfa(
  actorId: string, id: string,
  deps: { deleteFactor?: (userId: string, sid: string) => Promise<void> } = {},
): Promise<UserRow> {
  if (actorId === id) throw new AdminRuleError('You cannot reset your own MFA')
  const sid = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } })
    if (!existing) throw new AdminNotFoundError('User not found')
    await tx.user.update({
      where: { id },
      data: { mfaEnabled: false, mfaSecret: null, sessionVersion: { increment: 1 } },
    })
    await recordAudit(tx, {
      actorId, action: 'mfa.reset', targetType: 'User', targetId: id, companyId: existing.companyId,
    })
    return existing.mfaSecret
  })
  if (sid) {
    try {
      const deleteFactor = deps.deleteFactor ?? (await import('@/lib/twilio')).deleteTotpFactor
      await deleteFactor(id, sid)
    } catch (err) {
      logger.warn({ userId: id, err: err instanceof Error ? err.message : String(err) },
        'Failed to delete Twilio TOTP factor after MFA reset')
    }
  }
  return getUser(id)
}

export async function reissueInvite(
  actorId: string, id: string,
): Promise<{ token: string; expiresAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id } })
    if (!user) throw new AdminNotFoundError('User not found')
    if (user.status !== 'INVITED') throw new AdminRuleError('Only users with a pending invitation can be re-invited')
    const company = await tx.company.findUnique({ where: { id: user.companyId } })
    if (company?.status !== 'ACTIVE') throw new AdminRuleError('That company is deactivated')
    return issueInvite(tx, actorId, user)
  })
}
