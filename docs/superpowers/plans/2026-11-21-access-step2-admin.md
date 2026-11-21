# Access Management — Step 2 (Administration + Invite Links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform admin an `/admin` area (Companies · Users · Activity log) to create, edit and deactivate companies and users. Users are created by invitation: a one-time link shown on screen, which the invitee opens to set a password and enroll MFA.

**Architecture:**
- **Service layer:** all admin mutations live in `src/lib/admin/*` service functions. Each runs in one transaction and writes its `AuditLog` row in that same transaction.
- **APIs and pages:** API routes under `/api/admin/**` are thin `withAuth({ platformAdmin: true })` wrappers. Pages under `src/app/(dashboard)/admin/**` read through the services behind `requirePlatformAdmin()`.
- **Invites:** stored only as SHA-256 hashes.
- **Accepting an invite:** sets the password, makes the user `ACTIVE`, and signs them in. Step 1's mandatory-MFA wall then holds them at `/setup-mfa` until they enroll.

**Tech Stack:** Next.js 16 App Router, Prisma 7, NextAuth v5 JWT, Vitest, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-11-20-access-management-design.md` (§7 is step 2; §6 describes the step 1 foundation this builds on).

## Global Constraints

Everything from step 1 still applies:
- no git commits (the owner commits)
- public repo, so placeholder names only
- shared styling only: tokens and classes, no `style={{}}` and no hex in TSX
- `force-dynamic` on DB- or auth-touching pages and routes
- never trust `useSession().update()` payloads
- `tsc`, lint and `npm test` must pass
- tests run against the `_test` DB only
- the seed fallback stays untouched

New for this step:
- **Invite tokens:**
  - 32 random bytes from `crypto.randomBytes`, base64url-encoded
  - only `sha256(token)` (hex) is stored
  - the raw token is never stored, logged, put in audit metadata, or returned by any GET
- **Invite lifetime:** `INVITE_TTL_MS = 72 * 60 * 60 * 1000`. Single use. Issuing a new invite revokes every unused previous invite for that user.
- **Invite URL:** `new URL('/invite/' + token, serverEnv.NEXTAUTH_URL)`. Never built from the request's `Host` or `Origin` headers.
- **Password rule:**
  - 12–128 characters
  - must not equal the user's email (case-insensitive)
  - one shared Zod schema, used by the API and the client form
- **Audit metadata:** never contains passwords, tokens, token hashes or MFA secrets.
- **Self-protection:** the platform admin can't deactivate themselves, reset their own MFA, or deactivate the internal company.
- **New accounts:** `role` is always `REVIEWER`. There's no UI to grant `ADMIN` (that's step 4).
- **Every `/api/admin/**` route** uses `withAuth(handler, { platformAdmin: true })`, and a test enforces it.
- **Every admin page** sits under `src/app/(dashboard)/admin/`, whose `layout.tsx` and `template.tsx` both `await requirePlatformAdmin()`.

## Review Focus

1. **Two acceptances racing on the same link** (double-click, two tabs). Expected: exactly one succeeds; the other gets the generic invalid-link message. Owner: Task 4 (a conditional `updateMany where usedAt null and revokedAt null and expiresAt > now`, with `count === 1` required; test).
2. **A user deactivated, or whose company was deactivated, after the invite was issued opens the link.** Expected: the generic invalid-link message, and no password is set. Owner: Task 4 (test).
3. **A signed-in person opens an invite link.** Expected: the invite page still renders (it's public), and accepting signs them in as the invitee. Owner: Task 4 (the proxy treats `/invite` as public before any logged-in redirect; test in `proxy-rules`).
4. **The admin tries to deactivate themselves or reset their own MFA from the Users screen.** Expected: the action is refused with a clear message, and nothing changes. Owner: Task 3 (test) and Task 7 (buttons hidden for self).
5. **Re-issuing an invite** while the old link is still open in another browser. Expected: the old link stops working immediately. Owner: Task 3 (test: old token's accept fails after reissue).

---

## File Map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + migration `…_admin_invites_audit` | `UserInvite`, `AuditLog` |
| `src/lib/admin/audit.ts` | `recordAudit(tx, entry)`, `AuditAction` union, `listActivity()` |
| `src/lib/admin/invite-tokens.ts` | token generation, hashing, TTL, URL building (pure) |
| `src/lib/admin/errors.ts` | `AdminRuleError`, `AdminNotFoundError` |
| `src/lib/admin/companies.ts` | company services |
| `src/lib/admin/users.ts` | user services: invite, rename, status, reset MFA, reissue invite, list |
| `src/lib/admin/accept-invite.ts` | `getInviteState`, `acceptInvite` |
| `src/lib/password-policy.ts` | shared password Zod schema |
| `src/app/api/admin/**` | thin platformAdmin routes |
| `src/app/api/invite/accept/route.ts` | public, rate-limited acceptance |
| `src/app/(auth)/invite/[token]/page.tsx` + `InviteClient.tsx` | acceptance screen in the lamp scene |
| `src/proxy.ts`, `src/lib/auth-redirect.ts` | `/invite` is public |
| `src/app/(dashboard)/admin/**` | admin pages, layout and template |
| `src/components/ui/SectionTabs.tsx`, `src/components/admin/*` | tabs, forms, invite-link card |
| `src/components/shell/StaffShell.tsx`, `src/components/Sidebar.tsx` | "Administration" link for platform admins only |
| `src/styles/app.css` | admin table, badge and form classes |
| tests under `test/admin/*`, plus edits to `test/api-coverage.test.ts` and `test/proxy-rules.test.ts` | |

---

### Task 1: Schema, audit and invite-token primitives

**Files:**
- Modify: `prisma/schema.prisma`
- Create: the migration (`npx prisma migrate dev --name admin_invites_audit`), `src/lib/admin/audit.ts`, `src/lib/admin/invite-tokens.ts`, `src/lib/admin/errors.ts`
- Test: `test/admin/invite-tokens.test.ts`, `test/admin/audit.test.ts`

**Interfaces:**
- Produces:
  - `UserInvite { id, userId (FK User, cascade), tokenHash String @unique, expiresAt, usedAt?, revokedAt?, createdById (FK User), createdAt }`, indexed on `userId`
  - `AuditLog { id, actorId String? (FK User, SetNull), action String, targetType String, targetId String, companyId String?, metadata Json @default("{}"), createdAt }`, with `@@index([createdAt])`
  - `invite-tokens.ts`:
    - `INVITE_TTL_MS`
    - `generateInviteToken(): { token: string; tokenHash: string }`
    - `hashInviteToken(token: string): string`
    - `inviteUrl(token: string, base: string): string`
  - `audit.ts`:
    - `type AuditAction = 'company.created'|'company.renamed'|'company.deactivated'|'company.reactivated'|'user.invited'|'user.renamed'|'user.deactivated'|'user.reactivated'|'mfa.reset'|'invite.issued'|'invite.accepted'`
    - `recordAudit(tx: Prisma.TransactionClient, e: { actorId: string|null; action: AuditAction; targetType: 'Company'|'User'; targetId: string; companyId?: string|null; metadata?: Record<string, string|number|boolean|null> }): Promise<void>`
    - `listActivity(opts?: { limit?: number }): Promise<ActivityRow[]>`, newest first, default 100, joined to actor name and email
  - `errors.ts`: `class AdminRuleError extends Error`, `class AdminNotFoundError extends Error`

- [ ] **Step 1: Write the failing tests.**

```ts
it('token is 43 base64url chars and hash is its sha256 hex', () => {
  const { token, tokenHash } = generateInviteToken()
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
  expect(hashInviteToken(token)).toBe(tokenHash)
})
it('two tokens differ', () => expect(generateInviteToken().token).not.toBe(generateInviteToken().token))
it('inviteUrl uses the given base, never a header', () =>
  expect(inviteUrl('abc', 'https://crm.example.test')).toBe('https://crm.example.test/invite/abc'))
it('recordAudit writes inside the caller transaction and rolls back with it', async () => {
  await expect(testDb.$transaction(async (tx) => {
    await recordAudit(tx, { actorId: null, action: 'company.created', targetType: 'Company', targetId: 'x' })
    throw new Error('boom')
  })).rejects.toThrow('boom')
  expect(await testDb.auditLog.count()).toBe(0)
})
it('listActivity returns newest first with actor email', async () => { /* insert 2 rows with distinct createdAt; assert order + actor email */ })
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Update the schema and run the migration. It's purely additive, so no data-safety block is needed.
  - Extend `test/helpers/db.ts` `resetData()` to truncate `UserInvite` and `AuditLog` too.
- [ ] **Step 4: Verify** with `npm test`, `tsc` and lint.

---

### Task 2: Company services

**Files:**
- Create: `src/lib/admin/companies.ts`
- Test: `test/admin/companies.test.ts`

**Interfaces:**
- Consumes: `recordAudit`, `AdminRuleError`, `AdminNotFoundError` (Task 1).
- Produces:
  - `type CompanyRow = { id; name; kind: CompanyKind; status: CompanyStatus; userCount: number; createdAt: Date }`
  - `listCompanies(): Promise<CompanyRow[]>`: internal first, then by name
  - `getCompany(id): Promise<CompanyRow & { users: { id; name; email; status: UserStatus; mfaEnabled: boolean }[] }>`, throwing `AdminNotFoundError`
  - `createCompany(actorId, name): Promise<CompanyRow>`: always `CLIENT`; name trimmed, 1–120 characters; audit `company.created`
  - `renameCompany(actorId, id, name)`: audit `company.renamed`, with metadata `{ from, to }`
  - `setCompanyStatus(actorId, id, status: CompanyStatus)`:
    - refuses the internal company (`AdminRuleError`)
    - DEACTIVATED bumps `sessionVersion` for all members
    - audit `company.deactivated` / `company.reactivated`
    - a no-op if the status is unchanged (no audit row)

- [ ] **Step 1: Write the failing tests.**

```ts
it('creates a CLIENT company with an audit row', async () => {
  const c = await createCompany(adminId, '  Test Client Co ')
  expect(c).toMatchObject({ name: 'Test Client Co', kind: 'CLIENT', status: 'ACTIVE', userCount: 0 })
  expect(await testDb.auditLog.findFirst({ where: { action: 'company.created', targetId: c.id } })).not.toBeNull()
})
it('rejects an empty or overlong name', async () => { await expect(createCompany(adminId, '  ')).rejects.toThrow(AdminRuleError) })
it('deactivating bumps every member sessionVersion', async () => { /* 2 users v0 → both v1 */ })
it('refuses to deactivate the internal company', async () =>
  await expect(setCompanyStatus(adminId, 'internal-zimplixio', 'DEACTIVATED')).rejects.toThrow(AdminRuleError))
it('unchanged status writes no audit row', async () => { /* set ACTIVE on ACTIVE → audit count unchanged */ })
it('listCompanies counts users and puts internal first', async () => { /* … */ })
it('getCompany on an unknown id throws AdminNotFoundError', async () => { /* … */ })
```

- [ ] **Step 2: Run them and confirm they fail.** **Step 3: Implement**, with each mutation in `prisma.$transaction`. **Step 4: Verify** with `npm test`, `tsc` and lint.

---

### Task 3: User services (invite, rename, status, reset MFA, reissue)

**Files:**
- Create: `src/lib/admin/users.ts`
- Test: `test/admin/users.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 primitives
  - `assertAccountRules`, `normalizeEmail` (`src/lib/accounts.ts`)
  - `deleteTotpFactor(userId, factorSid)` from `src/lib/twilio.ts` (inject it for tests)
- Produces:
  - `type UserRow = { id; name; email; status: UserStatus; mfaEnabled: boolean; isPlatformAdmin: boolean; company: { id; name; kind }; createdAt: Date; pendingInvite: { expiresAt: Date } | null }`
  - `listUsers(filter?: { companyId?: string }): Promise<UserRow[]>`
  - `getUser(id): Promise<UserRow>` (throws `AdminNotFoundError`)
  - `inviteUser(actorId, input: { name: string; email: string; companyId: string }): Promise<{ user: UserRow; token: string }>`:
    - name 1–120 characters
    - the company must exist and be ACTIVE
    - `assertAccountRules` with role `REVIEWER`, mapped to `AdminRuleError`
    - a duplicate email → `AdminRuleError('An account with that email already exists')`
    - creates the user with `status INVITED`, `passwordHash null`, `mfaEnabled false`
    - creates an invite
    - audits `user.invited` and `invite.issued`
  - `renameUser(actorId, id, name)`: audit `user.renamed`
  - `setUserStatus(actorId, id, status: 'ACTIVE'|'DEACTIVATED')`:
    - refuses `actorId === id` for DEACTIVATED
    - DEACTIVATED bumps `sessionVersion` and revokes pending invites
    - reactivation sets `ACTIVE` if `passwordHash` is set, otherwise `INVITED`
    - audit
  - `resetUserMfa(actorId, id, deps?: { deleteFactor?: (userId: string, sid: string) => Promise<void> })`:
    - refuses self
    - clears `mfaEnabled` and `mfaSecret` and bumps `sessionVersion` in the transaction
    - after commit, calls `deleteFactor` best-effort; on failure, log a warning and don't throw
    - audit `mfa.reset`
  - `reissueInvite(actorId, id): Promise<{ token: string; expiresAt: Date }>`:
    - only for `INVITED` users (otherwise `AdminRuleError`)
    - revokes all unused invites, then creates a new one
    - audit `invite.issued`

- [ ] **Step 1: Write the failing tests.**

```ts
it('invites a client user: INVITED, no password, hashed token stored, raw token returned', async () => {
  const { user, token } = await inviteUser(adminId, { name: 'Client One', email: 'Client@Example.com', companyId: clientCo })
  expect(user).toMatchObject({ email: 'client@example.com', status: 'INVITED' })
  const inv = await testDb.userInvite.findFirstOrThrow({ where: { userId: user.id } })
  expect(inv.tokenHash).toBe(hashInviteToken(token)); expect(inv.tokenHash).not.toBe(token)
})
it('staff domain rules apply', async () => {
  await expect(inviteUser(adminId, { name: 'X', email: 'x@zimplixio.com', companyId: clientCo })).rejects.toThrow(AdminRuleError)
  await expect(inviteUser(adminId, { name: 'X', email: 'x@gmail.com', companyId: 'internal-zimplixio' })).rejects.toThrow(AdminRuleError)
})
it('rejects a duplicate email and an inactive company', async () => { /* … */ })
it('audit metadata never contains the token or its hash', async () => {
  const { token } = await inviteUser(adminId, { name: 'A', email: 'a@example.com', companyId: clientCo })
  const rows = await testDb.auditLog.findMany()
  for (const r of rows) expect(JSON.stringify(r.metadata)).not.toContain(token.slice(0, 10))
})
it('deactivate bumps sessionVersion and revokes pending invites; self-deactivate refused', async () => { /* … */ })
it('reactivate restores INVITED when no password was ever set', async () => { /* … */ })
it('resetUserMfa clears MFA, bumps version, calls deleteFactor; a deleteFactor failure does not throw; self refused', async () => { /* inject vi.fn() */ })
it('reissueInvite revokes the previous token (old hash now has revokedAt)', async () => { /* … */ })
it('reissueInvite refuses ACTIVE users', async () => { /* … */ })
```

- [ ] **Step 2: Run them and confirm they fail.** **Step 3: Implement.** **Step 4: Verify** with `npm test`, `tsc` and lint.

---

### Task 4: Accepting an invite (service, public API, page, proxy)

**Files:**
- Create:
  - `src/lib/password-policy.ts`
  - `src/lib/admin/accept-invite.ts`
  - `src/app/api/invite/accept/route.ts`
  - `src/app/(auth)/invite/[token]/page.tsx` and `InviteClient.tsx`
- Modify:
  - `src/proxy.ts`: treat `/invite` and `/invite/*` as public, handled before the logged-in branch
  - `test/api-coverage.test.ts`: add a `PUBLIC` exemption list containing `invite/accept`, with a comment explaining why
  - `test/proxy-rules.test.ts`
- Test: `test/admin/accept-invite.test.ts`

**Interfaces:**
- Consumes: Task 1 (`hashInviteToken`, `recordAudit`), the `rateLimit` helper (`src/lib/ratelimit.ts`), `AuthCard`, `AuthField`, `AuthAlert` (`src/components/auth/*`), `markSignedIn` (`src/lib/auth-redirect.ts`).
- Produces:
  - `password-policy.ts`: `passwordSchema(email: string)`, a Zod string schema enforcing 12–128 characters and `!== email` (case-insensitive)
  - `accept-invite.ts`:
    - `type InviteState = { ok: true; name: string; email: string } | { ok: false }`
    - `getInviteState(token: string): Promise<InviteState>`: `ok` only if the invite is unused, unrevoked and unexpired, the user is `INVITED`, and the company is `ACTIVE`
    - `acceptInvite(token: string, password: string): Promise<{ email: string }>`:
      - one transaction
      - `updateMany` on the invite where `tokenHash = hash, usedAt null, revokedAt null, expiresAt > now`, setting `usedAt`; requires `count === 1`
      - re-checks the user is `INVITED` and the company `ACTIVE`
      - validates the password with `passwordSchema(user.email)`
      - sets `passwordHash` (bcrypt 12) and `status ACTIVE`
      - audit `invite.accepted` (actor = the user)
      - any failure → `class InviteInvalidError` (generic), except password-rule failures → `InvitePasswordError` (carrying the Zod message)
  - **`POST /api/invite/accept` `{ token, password }`:**
    - not wrapped in `withAuth`; same-origin check via a small exported `sameOrigin` from `rbac.ts` (export it, don't duplicate it)
    - rate limit: 10 per 15 minutes keyed by `x-forwarded-for`'s first IP, plus 5 per 15 minutes keyed by the token hash
    - 200 `{ email }`
    - 400 `{ error: <password rule> }`
    - 410 `{ error: 'This invite link is invalid or has expired. Ask your Zimplixio admin for a new one.' }` for every invalid case
    - 429 on rate limit
  - **Page `/invite/[token]`:**
    - the server reads `getInviteState`
    - `ok` → `InviteClient` with name and email (email shown read-only), plus password and confirm fields (`AuthField revealable capsLockWarning`)
    - not ok → an `AuthCard` titled "This invite link can't be used" with the 410 copy
    - on success: `signIn('credentials', { email, password, redirect: false })`, then `markSignedIn()`, then `window.location.replace('/')`. The proxy then sends the user to `/setup-mfa`.
    - `metadata.title = 'Accept your invite'`

- [ ] **Step 1: Write the failing tests.**

```ts
it('valid invite: state ok, accept sets password + ACTIVE, marks used, audits', async () => { /* … */ })
it('accept is single-use and race-safe', async () => {
  const results = await Promise.allSettled([acceptInvite(t, pw), acceptInvite(t, pw)])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
})
it('expired / revoked / used / unknown tokens all throw InviteInvalidError', async () => { /* … */ })
it('a deactivated user or company makes the invite invalid and sets no password', async () => { /* … */ })
it('a weak password throws InvitePasswordError and does NOT consume the invite', async () => {
  await expect(acceptInvite(t, 'short')).rejects.toThrow(InvitePasswordError)
  expect((await getInviteState(t)).ok).toBe(true)
})
// proxy-rules: '/invite/abc' is public even for logged-in users (isPublicPath('/invite/abc') === true; '/invitex' false)
```

The weak-password test means the password must be validated **before** the invite is consumed. Validate after looking up the user's email, but outside or before the conditional update.

- [ ] **Step 2: Run them and confirm they fail.** **Step 3: Implement.**
  - Export `isPublicPath(pathname)` from `auth-redirect.ts` (`/login`, `/invite`, `/invite/*`) and use it in the proxy.
- [ ] **Step 4: Verify** with `npm test`, `tsc`, lint and `npm run build` (`/invite/[token]` shows as ƒ).

---

### Task 5: Admin API routes

**Files:**
- Create:
  - `src/app/api/admin/companies/route.ts`: `POST { name }`
  - `src/app/api/admin/companies/[id]/route.ts`: `PATCH { name } | { status }`
  - `src/app/api/admin/users/route.ts`: `POST { name, email, companyId }`
  - `src/app/api/admin/users/[id]/route.ts`: `PATCH { name } | { status }`
  - `src/app/api/admin/users/[id]/reset-mfa/route.ts`: `POST`
  - `src/app/api/admin/users/[id]/invite/route.ts`: `POST` (reissue)
- Modify: `test/api-coverage.test.ts`
- Test: `test/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: the Task 2–3 services, `withAuth`, `parseJson`/`z` (`src/lib/validate.ts`), `apiError` (`src/lib/errors.ts`), `inviteUrl` + `serverEnv.NEXTAUTH_URL`.
- Produces:
  - Every route is `withAuth(handler, { platformAdmin: true })`, with the actor = `session.active.userId`.
  - `AdminRuleError` → `apiError('VALIDATION_ERROR', message)`; `AdminNotFoundError` → `NOT_FOUND`.
  - The invite and reissue routes return `{ user?, inviteUrl, expiresAt }`. `inviteUrl` appears in that one response only.
  - All routes have `force-dynamic`.

- [ ] **Step 1: Write the failing tests.**

```ts
// api-coverage: every route.ts under src/app/api/admin passes `platformAdmin: true` to withAuth
it('every admin route requires platformAdmin', () => expect(adminRoutesMissingPlatformAdmin()).toEqual([]))
// admin-routes (mock services + session-guard like test/with-auth.test.ts; send Origin/Host headers):
it('POST /api/admin/users returns inviteUrl built from NEXTAUTH_URL', async () => { /* expect startsWith(process.env.NEXTAUTH_URL + '/invite/') */ })
it('AdminRuleError maps to 400 with its message', async () => { /* … */ })
it('a non-admin staff caller gets 403, a client 404', async () => { /* … */ })
```

- [ ] **Step 2: Run them and confirm they fail.** **Step 3: Implement.** **Step 4: Verify** with `npm test`, `tsc` and lint.

---

### Task 6: Admin area shell, sidebar link, Companies screens

**Files:**
- Create:
  - `src/app/(dashboard)/admin/layout.tsx` and `template.tsx`: both `await requirePlatformAdmin()`, both `force-dynamic`. The layout renders a header ("Administration") plus `SectionTabs` (Companies `/admin/companies` · Users `/admin/users` · Activity log `/admin/activity`).
  - `src/app/(dashboard)/admin/page.tsx`: `redirect('/admin/companies')`
  - `src/app/(dashboard)/admin/companies/page.tsx` + `CompaniesClient.tsx`: a table (name, kind badge, status badge, user count), plus a "New company" inline form
  - `src/app/(dashboard)/admin/companies/[id]/page.tsx` + `CompanyDetailClient.tsx`: rename, deactivate/reactivate (with a confirm step for deactivate; hidden for the internal company), members table linking to `/admin/users/[id]`, and an "Invite user to this company" link to `/admin/users?companyId=…&invite=1`
  - `src/components/ui/SectionTabs.tsx`: a generic client tab bar (`tabs: {href,label}[]`), active by prefix, token classes only
- Modify:
  - `StaffShell.tsx`: get `isPlatformAdmin` via `getActiveSession()` (cached) and pass it to `Sidebar`
  - `Sidebar.tsx`: accept `isPlatformAdmin`. When true, render an "Administration" link (Lucide `ShieldCheck`) above Settings in the bottom group, using that group's existing visual pattern. Don't restyle the rest of the Sidebar.
  - `src/styles/app.css`: `.admin-table`, `.badge-status-*`, `.badge-kind-*`, `.admin-form` classes built from the tokens

**Interfaces:**
- Consumes: `listCompanies`, `getCompany` (Task 2) and `/api/admin/companies*` (Task 5).
- Client components call the APIs, then `router.refresh()`. Errors show inline with `--error` styling.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify:**
  - `tsc`, lint and `npm run build` (`/admin/companies` is ƒ)
  - `grep -rn 'style={{' src/app/(dashboard)/admin src/components/ui/SectionTabs.tsx` returns nothing

---

### Task 7: Users and Activity screens, invite-link card

**Files:**
- Create:
  - `src/app/(dashboard)/admin/users/page.tsx` + `UsersClient.tsx`:
    - a company filter (select; `?companyId=`)
    - a table: name, email, company, status badge, MFA (Enrolled/Not yet), pending invite expiry
    - an "Invite user" form (name, email, company select; opens prefilled when `?invite=1`)
  - `src/app/(dashboard)/admin/users/[id]/page.tsx` + `UserDetailClient.tsx`:
    - rename
    - Deactivate/Reactivate
    - Reset MFA (confirm step, with copy: "They'll be signed out and must set up their authenticator again at next sign-in.")
    - Reissue invite (only when `INVITED`)
    - For the signed-in admin's own row, hide Deactivate and Reset MFA and show "This is your account".
  - `src/components/admin/InviteLinkCard.tsx`:
    - shows the URL in a read-only field, with a "Copy link" button (`navigator.clipboard`, "Copied" feedback)
    - the copy: "This link is shown once. Send it to {name} through a channel you trust. It expires {date}."
  - `src/app/(dashboard)/admin/activity/page.tsx`: a table of the newest 100 entries (when, who, action as readable text, target, company). It's read-only. Map `AuditAction` to human labels in one exported record.

**Interfaces:**
- Consumes: `listUsers`, `getUser` (Task 3), `listActivity` (Task 1), `listCompanies` (Task 2) and `/api/admin/users*` (Task 5).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify:**
  - `tsc`, lint and `npm run build`
  - no `style={{` in the new files
  - `npm test` passes

---

### Task 8: Live verification and docs

**Files:**
- Modify: `docs/SECURITY.md` (the admin area, invites, audit log), `CLAUDE.md` (status; the rule that admin mutations go through `src/lib/admin/*` with audit in the same transaction), `README.md` (the Admin section now describes `/admin`; the CLI becomes a fallback), `docs/GOTCHAS.md` (only if something new bites), and the spec's step-2 status line.
- Live-check scripts go in the session scratchpad, not the repo.

- [ ] **Step 1: Run the live check** (`next dev` on port 3000, local DB; MFA proofs minted with the scratchpad `mint.ts`; enrollment emulated as in step 1). Each check below must pass:
  1. The admin (an internal staff test user with `role ADMIN`, created by script) sees "Administration" in the sidebar. A non-admin staff test user doesn't, and gets a 404 on `/admin`. A client gets redirected to `/portal`.
  2. Create the company "Test Client Co". It appears in the list with 0 users, and the activity log shows `company.created`.
  3. Invite `client@example.com` to it. The invite-link card shows a URL starting with `NEXTAUTH_URL/invite/`. The activity log shows `user.invited` and `invite.issued`.
  4. In a fresh browser context, open the link:
     - a weak password shows the rule
     - a strong password signs the user in and lands on `/setup-mfa`
     - after emulated enrollment, they reach `/portal`
     - the activity log shows `invite.accepted`
  5. Re-opening the same link shows "This invite link can't be used".
  6. Reissue for a second invited user: the old link fails and the new one works.
  7. Reset the client's MFA: their next click lands on `/login?reason=session-ended`, and after signing in they're held at `/setup-mfa`.
  8. Deactivate the client: they're signed out on their next click, and login fails. Reactivate: login works.
  9. Deactivate the company: its users are signed out. The internal company shows no deactivate button. Calling the API directly to deactivate it returns 400.
  10. On their own user page, the admin sees no Deactivate or Reset MFA buttons.
  11. An expired invite (set `expiresAt` in the past in the local DB) shows the invalid-link page.
  12. Clean up all test data and `RateLimit` rows, and stop the server.
- [ ] **Step 2: Update the docs.**
- [ ] **Step 3: Final verification:** `npm test`, `npx tsc --noEmit`, eslint, `npm run build`. Report a table of live-check results.
