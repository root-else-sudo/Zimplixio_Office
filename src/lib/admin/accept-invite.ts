import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hashInviteToken } from '@/lib/admin/invite-tokens'
import { recordAudit } from '@/lib/admin/audit'
import { passwordSchema } from '@/lib/password-policy'

export type InviteState = { ok: true; name: string; email: string } | { ok: false }

/** Every invalid reason (unknown, expired, used, revoked, inactive) looks the same. */
export class InviteInvalidError extends Error {
  constructor() {
    super('invalid invite')
    this.name = 'InviteInvalidError'
  }
}

export class InvitePasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvitePasswordError'
  }
}

const userSelect = {
  id: true, name: true, email: true, status: true, companyId: true,
  company: { select: { status: true } },
} as const

async function findLiveInvite(tokenHash: string) {
  const invite = await prisma.userInvite.findUnique({
    where: { tokenHash },
    select: { usedAt: true, revokedAt: true, expiresAt: true, user: { select: userSelect } },
  })
  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt.getTime() <= Date.now()) return null
  if (invite.user.status !== 'INVITED' || invite.user.company.status !== 'ACTIVE') return null
  return invite.user
}

export async function getInviteState(token: string): Promise<InviteState> {
  const user = await findLiveInvite(hashInviteToken(token))
  return user ? { ok: true, name: user.name, email: user.email } : { ok: false }
}

export async function acceptInvite(token: string, password: string): Promise<{ email: string }> {
  const tokenHash = hashInviteToken(token)

  // Validate the password first so a weak one never burns the link.
  const found = await findLiveInvite(tokenHash)
  if (!found) throw new InviteInvalidError()
  const parsed = passwordSchema(found.email).safeParse(password)
  if (!parsed.success) throw new InvitePasswordError(parsed.error.issues[0].message)
  const passwordHash = await bcrypt.hash(password, 12)

  return prisma.$transaction(async (tx) => {
    const now = new Date()
    const claimed = await tx.userInvite.updateMany({
      where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (claimed.count !== 1) throw new InviteInvalidError()

    const invite = await tx.userInvite.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } })
    const user = await tx.user.findUnique({ where: { id: invite.userId }, select: userSelect })
    // Throwing rolls back the usedAt claim above.
    if (!user || user.status !== 'INVITED' || user.company.status !== 'ACTIVE') throw new InviteInvalidError()

    await tx.user.update({ where: { id: user.id }, data: { passwordHash, status: 'ACTIVE' } })
    await recordAudit(tx, {
      actorId: user.id,
      action: 'invite.accepted',
      targetType: 'User',
      targetId: user.id,
      companyId: user.companyId,
    })
    return { email: user.email }
  })
}
