import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generateInviteToken, hashInviteToken, inviteUrl, INVITE_TTL_MS } from '@/lib/admin/invite-tokens'

describe('invite tokens', () => {
  it('token is 43 base64url chars and hash is its sha256 hex', () => {
    const { token, tokenHash } = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hashInviteToken(token)).toBe(tokenHash)
  })
  it('two tokens differ', () => expect(generateInviteToken().token).not.toBe(generateInviteToken().token))
  it('inviteUrl uses the given base, never a header', () =>
    expect(inviteUrl('abc', 'https://crm.example.test')).toBe('https://crm.example.test/invite/abc'))
  it('ttl is 72 hours', () => expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000))
})
