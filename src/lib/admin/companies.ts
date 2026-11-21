import type { CompanyKind, CompanyStatus, Prisma, UserStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/admin/audit'
import { AdminNotFoundError, AdminRuleError } from '@/lib/admin/errors'

export type CompanyRow = {
  id: string
  name: string
  kind: CompanyKind
  status: CompanyStatus
  userCount: number
  createdAt: Date
}

export type CompanyDetail = CompanyRow & {
  users: { id: string; name: string; email: string; status: UserStatus; mfaEnabled: boolean }[]
}

const MAX_NAME = 120

function cleanName(raw: string): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > MAX_NAME) {
    throw new AdminRuleError(`Company name must be 1-${MAX_NAME} characters`)
  }
  return name
}

type CompanyWithCount = Prisma.CompanyGetPayload<{ include: { _count: { select: { users: true } } } }>

function toRow(c: CompanyWithCount): CompanyRow {
  return { id: c.id, name: c.name, kind: c.kind, status: c.status, userCount: c._count.users, createdAt: c.createdAt }
}

const withCount = { _count: { select: { users: true } } } as const

export async function listCompanies(): Promise<CompanyRow[]> {
  const rows = await prisma.company.findMany({ include: withCount })
  return rows
    .map(toRow)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'INTERNAL' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export async function getCompany(id: string): Promise<CompanyDetail> {
  const c = await prisma.company.findUnique({
    where: { id },
    include: {
      ...withCount,
      users: {
        select: { id: true, name: true, email: true, status: true, mfaEnabled: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  if (!c) throw new AdminNotFoundError('Company not found')
  return { ...toRow(c), users: c.users }
}

export async function createCompany(actorId: string, name: string): Promise<CompanyRow> {
  const clean = cleanName(name)
  const id = await prisma.$transaction(async (tx) => {
    const c = await tx.company.create({ data: { name: clean, kind: 'CLIENT' } })
    await recordAudit(tx, {
      actorId, action: 'company.created', targetType: 'Company', targetId: c.id, companyId: c.id,
      metadata: { name: clean },
    })
    return c.id
  })
  return getCompany(id)
}

export async function renameCompany(actorId: string, id: string, name: string): Promise<CompanyRow> {
  const clean = cleanName(name)
  await prisma.$transaction(async (tx) => {
    const existing = await tx.company.findUnique({ where: { id } })
    if (!existing) throw new AdminNotFoundError('Company not found')
    await tx.company.update({ where: { id }, data: { name: clean } })
    await recordAudit(tx, {
      actorId, action: 'company.renamed', targetType: 'Company', targetId: id, companyId: id,
      metadata: { from: existing.name, to: clean },
    })
  })
  return getCompany(id)
}

export async function setCompanyStatus(actorId: string, id: string, status: CompanyStatus): Promise<CompanyRow> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.company.findUnique({ where: { id } })
    if (!existing) throw new AdminNotFoundError('Company not found')
    if (existing.kind === 'INTERNAL') throw new AdminRuleError('The internal company cannot be deactivated')
    if (existing.status === status) return
    await tx.company.update({ where: { id }, data: { status } })
    if (status === 'DEACTIVATED') {
      await tx.user.updateMany({ where: { companyId: id }, data: { sessionVersion: { increment: 1 } } })
    }
    await recordAudit(tx, {
      actorId,
      action: status === 'DEACTIVATED' ? 'company.deactivated' : 'company.reactivated',
      targetType: 'Company', targetId: id, companyId: id,
    })
  })
  return getCompany(id)
}
