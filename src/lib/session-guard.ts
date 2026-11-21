import { cache } from 'react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { evaluateSession, USER_STATE_SELECT, type ActiveSession } from '@/lib/session-eval'

// Pure parts live in session-eval.ts (importable from the proxy without pulling in auth).
export { evaluateSession } from '@/lib/session-eval'
export type { ActiveSession, TokenClaims, DbUserState } from '@/lib/session-eval'

/** Per-request cached: a layout and a page share one DB read. */
export const getActiveSession = cache(async (): Promise<ActiveSession | null> => {
  const session = await auth()
  const u = session?.user
  if (!u?.id) return null

  const db = await prisma.user.findUnique({
    where: { id: u.id },
    select: USER_STATE_SELECT,
  })

  return evaluateSession(
    {
      id: u.id,
      sid: u.sid,
      companyId: u.companyId,
      accountKind: u.accountKind,
      sessionVersion: u.sessionVersion,
      mfaVerified: u.mfaVerified,
    },
    db,
  )
})
