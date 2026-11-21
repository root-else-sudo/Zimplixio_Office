import { createHash, randomBytes } from 'node:crypto'

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 32 random bytes, base64url. Only the hash is ever persisted. */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

/** `base` must come from server config (NEXTAUTH_URL), never request headers. */
export function inviteUrl(token: string, base: string): string {
  return new URL('/invite/' + token, base).toString()
}
