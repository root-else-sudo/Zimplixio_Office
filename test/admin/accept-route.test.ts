import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { resetData, testDb, INTERNAL_COMPANY_ID } from '../helpers/db'
import { inviteUser } from '@/lib/admin/users'
import { getInviteState } from '@/lib/admin/accept-invite'
import { POST } from '@/app/api/invite/accept/route'

const GOOD_PW = 'a-long-enough-password'
const INVALID_COPY = 'This invite link is invalid or has expired. Ask your Zimplixio admin for a new one.'
let adminId: string
let clientCo: string

function call(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return POST(
    new NextRequest('http://localhost/api/invite/accept', {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', ...headers },
    }),
  )
}
const invite = (email = 'client@example.com') => inviteUser(adminId, { name: 'Client One', email, companyId: clientCo })

beforeEach(async () => {
  await resetData()
  adminId = (await testDb.user.create({
    data: { name: 'Admin Person', email: 'admin@zimplixio.com', role: 'ADMIN', companyId: INTERNAL_COMPANY_ID },
  })).id
  clientCo = (await testDb.company.create({ data: { name: 'Client Co', kind: 'CLIENT' } })).id
})

describe('POST /api/invite/accept', () => {
  it('rejects a cross-origin request with 403', async () => {
    const res = await call({ token: 'x', password: GOOD_PW }, { origin: 'http://evil.test', host: 'localhost' })
    expect(res.status).toBe(403)
  })

  it('malformed JSON gives 410', async () => {
    expect((await call(undefined, {}, '{nope')).status).toBe(410)
  })

  it('unknown token gives 410 with the generic copy', async () => {
    const res = await call({ token: 'unknown-token', password: GOOD_PW })
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: INVALID_COPY })
  })

  it('weak password gives 400 and the invite stays usable', async () => {
    const { token } = await invite()
    const res = await call({ token, password: 'short' })
    expect(res.status).toBe(400)
    expect((await getInviteState(token)).ok).toBe(true)
  })

  it('valid accept gives 200 with the email', async () => {
    const { token } = await invite()
    const res = await call({ token, password: GOOD_PW })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: 'client@example.com' })
  })

  it('per-token limit: the 6th attempt gives 429 with Retry-After', async () => {
    const { token } = await invite()
    for (let i = 0; i < 5; i++) expect((await call({ token, password: 'short' })).status).toBe(400)
    const res = await call({ token, password: GOOD_PW })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('uses cf-connecting-ip for the per-IP budget', async () => {
    // 10 attempts per IP; each attempt uses a distinct unknown token so the token limit never trips.
    for (let i = 0; i < 10; i++) {
      expect((await call({ token: `t${i}`, password: GOOD_PW }, { 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '198.51.100.9' })).status).toBe(410)
    }
    const blocked = await call({ token: 'tx', password: GOOD_PW }, { 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '198.51.100.9' })
    expect(blocked.status).toBe(429)
    const other = await call({ token: 'ty', password: GOOD_PW }, { 'cf-connecting-ip': '203.0.113.2', 'x-forwarded-for': '198.51.100.9' })
    expect(other.status).toBe(410)
  })
})
