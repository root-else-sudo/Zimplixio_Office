import { prisma } from '@/lib/prisma'
import { evaluateSession, USER_STATE_SELECT, type TokenClaims } from '@/lib/session-eval'

/**
 * DB-backed liveness check for the proxy: is this token's session still valid
 * (user active, sessionVersion matches, etc.)? Throws if the DB call fails.
 */
export async function isSessionStillActive(claims: TokenClaims): Promise<boolean> {
  if (!claims.id) return false
  const db = await prisma.user.findUnique({
    where: { id: claims.id },
    select: USER_STATE_SELECT,
  })
  return evaluateSession(claims, db) !== null
}
