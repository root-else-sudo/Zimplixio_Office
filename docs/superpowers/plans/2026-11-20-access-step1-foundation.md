# Access Management — Step 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add companies (tenants), staff vs. client accounts, a deny-by-default wall for pages and APIs, an empty client portal, immediate session revocation and mandatory MFA, without changing anything the owner's staff account can do today.

**Architecture:**
- **Data:** a `Company` table. `User` gains `companyId`, `status` and `sessionVersion`. "Staff" means the user's company is the single `INTERNAL` one.
- **Session check:** one database-backed function, `getActiveSession()`. Every page guard and `withAuth` route call it, so deactivation and `sessionVersion` bumps take effect on the next request.
- **Routing:** the proxy only redirects for speed. Server layouts and `withAuth` are the real boundary, and both deny by default.
- **Tenant data:** a scoped Prisma client (`tenantDb`) is the only path to tenant-owned data. It's built and tested now; no client-data models exist yet.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (driver adapter), NextAuth v5 JWT, Vitest (new, tests only), Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-11-20-access-management-design.md` (§6 is step 1). Read it alongside this plan.

## Global Constraints

- **No git commits.** The owner makes all commits. Each task ends with verification, not a commit.
- **Public repo:** no real client or person names in seed data, fixtures, tests or docs. Use placeholders like `Test Client Co` and `client@example.com`.
- **Staff domain:** exactly `zimplixio.com`, compared case-insensitively. Emails are stored lower-cased.
- **Styling:** tokens and `@theme` classes and shared components only. No inline `style={{}}` and no hex in TSX in files you create or rewrite (CLAUDE.md rule 5).
- **`src/lib/auth.config.ts` stays edge-safe:** no Prisma, no `node:` imports.
- **`export const dynamic = 'force-dynamic'`** on every new page, layout or route that calls `auth()` or Prisma.
- **Never trust `useSession().update()` payloads** (GOTCHAS #12). Never refresh `sessionVersion` from the database on update, because that would heal a revoked token.
- **Before declaring any task done:**
  - Run `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit`, plus lint on touched files.
  - From Task 1 on, also run `npm test`.
- **Tests run only against a database whose name ends in `_test`.** The harness must refuse anything else.
- **Leave the seed's default-credential fallback unchanged.** It's a deliberately deferred item.

## Review Focus

1. **Redirect loop with a revoked or stale token.** The proxy thinks you're signed in (a valid JWT), but `getActiveSession()` says no, so `/login` bounces back to `/` and loops. Expected behavior: you land on `/login?reason=session-ended` with your cookie cleared. Covered in Task 5 (the session-end route, plus a test).
2. **Pre-deploy tokens without the new claims** (`accountKind`, `companyId`, `sessionVersion`). Expected: treated as signed out, a one-time re-login, no loop, no 500. Covered in Task 2 (`evaluateSession` test) and Task 5 (the proxy's `isLoggedIn` requires `accountKind`).
3. **Email case after migration.** A user types `Owner@Zimplixio.com`, but the stored address is lower-case. Expected: login still works. Covered in Task 2 (`authorize` normalizes; test on `normalizeEmail`).
4. **A deactivated company whose users are still `ACTIVE`.** Expected: all its users are blocked at login and on the next request. Covered in Task 2 (`evaluateSession` test plus authorize).
5. **A client user loading Next internals, `/api/auth/*` (session refresh, sign-out) or `/setup-mfa`.** Expected: these work, and the wall doesn't break sign-out or MFA enrollment. Covered in Task 5 (proxy allow-list test) and Task 7 (live check).

---

## File Map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + new migration `…_access_foundation` | `Company`, enums, `User` columns, data backfill, partial index, invariant check |
| `src/lib/accounts.ts` (new) | Account rules: domain, admin-only-staff, `normalizeEmail`, `accountKindOf` |
| `vitest.config.ts`, `test/setup/env.ts`, `test/setup/global-setup.ts`, `test/helpers/db.ts` (new) | Test harness bound to the `_test` database |
| `src/lib/auth.config.ts`, `src/lib/auth.ts`, `src/types/next-auth.d.ts` | New claims; `authorize` refusals; update re-reads |
| `src/lib/session-guard.ts` (new) | `evaluateSession` (pure) and `getActiveSession` (DB, cached per request) |
| `src/lib/rbac.ts` | `withAuth`: audience, `platformAdmin`, MFA enrollment, active session |
| `src/app/api/mfa/*` | Audience flags; `disable` route deleted |
| `src/lib/tenancy.ts` (new) | `getTenantContext`, `scopedClient`, `tenantDb`, `getOwnCompany` |
| `src/lib/guards.ts` (new) | `decideAccess` (pure), plus `requireSignedIn` / `requireStaff` / `requireClient` / `requirePlatformAdmin` |
| `src/app/api/session/end/route.ts` (new) | Clears the session cookie and redirects to `/login?reason=session-ended` |
| `src/proxy.ts`, `src/lib/auth-redirect.ts` | Kind routing, enrollment redirect, client allow-list |
| `src/components/shell/StaffShell.tsx`, `PortalShell.tsx` (new) | The two app frames |
| `src/app/(dashboard)/layout.tsx` | Uses `requireStaff` + `StaffShell` |
| `src/app/(portal)/layout.tsx`, `src/app/(portal)/portal/page.tsx` (new) | Client portal shell + empty state |
| `src/app/(account)/layout.tsx`, `src/app/(account)/settings/*` (moved) | Settings in either shell; MFA status only |
| `src/app/(auth)/setup-mfa/SetupMfaClient.tsx` | Forced-enrollment footer |
| `src/styles/app.css` (new, imported in `globals.css`) | Portal-shell and settings-card classes |
| `scripts/access-admin.ts` (new) + npm script | Interim CLI: create client user, deactivate/reactivate, bump session |
| Docs: `docs/SECURITY.md`, `CLAUDE.md`, `docs/GOTCHAS.md`, `README.md` | Describe the new model |

---

### Task 1: Data model, migration, account rules, test harness

**Files:**
- Modify: `prisma/schema.prisma` (User at lines 11–21; add Company and enums)
- Create: `prisma/migrations/<timestamp>_access_foundation/migration.sql` (generate, then hand-edit)
- Create: `src/lib/accounts.ts`
- Modify: `prisma/seed.ts` (`seedAdminUser`, around line 134)
- Create: `vitest.config.ts`, `test/setup/env.ts`, `test/setup/global-setup.ts`, `test/helpers/db.ts`
- Modify: `package.json` (`"test": "vitest run"`, `"test:watch": "vitest"`; devDependency `vitest`)
- Test: `test/accounts.test.ts`, `test/migration.test.ts`

**Interfaces:**
- Produces:
  - Prisma models `Company { id, name, kind: CompanyKind, status: CompanyStatus, users, createdAt, updatedAt }`, plus enums `CompanyKind { INTERNAL CLIENT }`, `CompanyStatus { ACTIVE DEACTIVATED }`, `UserStatus { ACTIVE INVITED DEACTIVATED }`.
  - `User` gains `companyId String` (FK, indexed), `company Company`, `status UserStatus @default(ACTIVE)` and `sessionVersion Int @default(0)`. `passwordHash` becomes `String?`.
  - `src/lib/accounts.ts`:
    - `export const STAFF_DOMAIN = 'zimplixio.com'`
    - `export type AccountKind = 'STAFF' | 'CLIENT'`
    - `export function normalizeEmail(email: string): string` (trim + lower-case)
    - `export function accountKindOf(companyKind: CompanyKind): AccountKind`
    - `export class AccountRuleError extends Error {}`
    - `export function assertAccountRules(input: { email: string; companyKind: CompanyKind; role: Role }): void`. It throws `AccountRuleError` for:
      - a staff email not on `STAFF_DOMAIN`
      - a client email on `STAFF_DOMAIN`
      - `ADMIN` on a client
  - `test/helpers/db.ts`: `export const testDb: PrismaClient` (on `DATABASE_URL_TEST`) and `export async function resetData(): Promise<void>` (truncates `User` and `Company`, then re-inserts the internal company).

- [ ] **Step 1: Create the test database and environment.**
  - Run `createdb zimplixio_office_test`.
  - Add `DATABASE_URL_TEST=postgresql://…/zimplixio_office_test` to the local `.env`. It uses the same credentials as `DATABASE_URL`, and `.env` is gitignored.
- [ ] **Step 2: Write the harness.**
  - `test/setup/env.ts`:
    - runs `process.loadEnvFile('.env')` when the file exists
    - **throws** unless `DATABASE_URL_TEST` is set and its database name ends in `_test`
    - then sets `process.env.DATABASE_URL = process.env.DATABASE_URL_TEST`
  - `global-setup.ts`: runs `npx prisma migrate reset --force --skip-seed` with that env.
  - `vitest.config.ts`: `test.include: ['test/**/*.test.ts']`, `setupFiles: ['test/setup/env.ts']`, `globalSetup`, the `@` alias to `src`, `pool: 'forks'`, and `fileParallelism: false` (one shared DB).
- [ ] **Step 3: Write the failing tests.**

```ts
// test/accounts.test.ts
it('normalizes email', () => expect(normalizeEmail('  Owner@Zimplixio.COM ')).toBe('owner@zimplixio.com'))
it('staff must use the staff domain', () =>
  expect(() => assertAccountRules({ email: 'a@gmail.com', companyKind: 'INTERNAL', role: 'REVIEWER' })).toThrow(AccountRuleError))
it('clients may use any domain but not the staff one', () => {
  expect(() => assertAccountRules({ email: 'a@gmail.com', companyKind: 'CLIENT', role: 'REVIEWER' })).not.toThrow()
  expect(() => assertAccountRules({ email: 'a@ZIMPLIXIO.com', companyKind: 'CLIENT', role: 'REVIEWER' })).toThrow(AccountRuleError)
})
it('only staff can be ADMIN', () =>
  expect(() => assertAccountRules({ email: 'a@acme.example', companyKind: 'CLIENT', role: 'ADMIN' })).toThrow(AccountRuleError))
it('derives kind', () => { expect(accountKindOf('INTERNAL')).toBe('STAFF'); expect(accountKindOf('CLIENT')).toBe('CLIENT') })

// test/migration.test.ts — against the migrated _test DB
it('has exactly one INTERNAL company after migration', async () =>
  expect(await testDb.company.count({ where: { kind: 'INTERNAL' } })).toBe(1))
it('rejects a second INTERNAL company (partial unique index)', async () =>
  await expect(testDb.company.create({ data: { name: 'Dup', kind: 'INTERNAL' } })).rejects.toThrow())
```

- [ ] **Step 4: Run `npm test` and confirm the tests fail** (missing module/models).
- [ ] **Step 5: Update the schema, then generate the migration with `npx prisma migrate dev --create-only --name access_foundation`.**
- [ ] **Step 6: Hand-edit `migration.sql` into this order:**
  1. Create the enums and the `Company` table.
  2. `INSERT` the internal company (`id` = `'internal-zimplixio'`, `name` = `'Zimplixio'`, `kind` = `'INTERNAL'`).
  3. Add `companyId` as **nullable**, plus `status`, `sessionVersion`, and nullable `passwordHash`.
  4. `UPDATE "User" SET "companyId" = 'internal-zimplixio', email = lower(trim(email))`.
  5. `ALTER ... SET NOT NULL`.
  6. Add the FK and index.
  7. `CREATE UNIQUE INDEX "Company_single_internal" ON "Company"(kind) WHERE kind = 'INTERNAL'`.
  8. A `DO $$ … $$` block that `RAISE EXCEPTION`s with a readable message if:
     - any internal user's email isn't `%@zimplixio.com`
     - `count(*) where role='ADMIN' > 1`
     - `count(*) <> count(distinct lower(email))`

  Then apply it with `npx prisma migrate dev`.
- [ ] **Step 7: Implement `src/lib/accounts.ts`** per Interfaces.
- [ ] **Step 8: Update the seed.** `seedAdminUser` upserts the internal company (same fixed id), normalizes the email, calls `assertAccountRules`, and connects the user to the company. Don't touch the fallback lines.
- [ ] **Step 9: Verify.**
  - `npm test` passes.
  - `npx tsc --noEmit` is clean.
  - Running `psql "$DATABASE_URL" -c 'select email, role, "companyId", status from "User"'` (local dev DB) shows the admin attached to `internal-zimplixio`, `ACTIVE`.

---

### Task 2: Session claims, login refusals, `getActiveSession`

**Files:**
- Modify: `src/types/next-auth.d.ts`, `src/lib/auth.config.ts` (`jwt`/`session` callbacks), `src/lib/auth.ts` (`authorize`, `jwt` update branch)
- Create: `src/lib/session-guard.ts`
- Test: `test/session-guard.test.ts`

**Interfaces:**
- Consumes: `accountKindOf`, `normalizeEmail` (Task 1).
- Produces:
  - **JWT claims:** `companyId: string`, `accountKind: AccountKind`, `isPlatformAdmin: boolean` (`role === 'ADMIN' && kind === 'STAFF'`), `sessionVersion: number`.
  - **Session user:** gains `companyId`, `accountKind`, `isPlatformAdmin`.
  - **`src/lib/session-guard.ts`:**
    - `export type ActiveSession = { userId: string; email: string; name: string; sid: string; companyId: string; accountKind: AccountKind; isPlatformAdmin: boolean; mfaEnabled: boolean; mfaVerified: boolean }`
    - `export type TokenClaims = { id?: string; sid?: string; companyId?: string; accountKind?: string; sessionVersion?: number; mfaVerified?: boolean }`
    - `export type DbUserState = { id: string; email: string; name: string; status: UserStatus; sessionVersion: number; role: Role; mfaEnabled: boolean; companyId: string; company: { kind: CompanyKind; status: CompanyStatus } } | null`
    - `export function evaluateSession(claims: TokenClaims, db: DbUserState): ActiveSession | null` (pure)
    - `export const getActiveSession: () => Promise<ActiveSession | null>`, wrapped in React `cache()`. It calls `auth()`, reads the user with company by id, then calls `evaluateSession`.

- [ ] **Step 1: Write the failing tests.**

```ts
// test/session-guard.test.ts — evaluateSession is pure; build claims/db fixtures inline
it('accepts a matching active session', () => expect(evaluateSession(claims(), db())).toMatchObject({ accountKind: 'STAFF', isPlatformAdmin: true }))
it('rejects tokens missing new claims (pre-deploy tokens)', () =>
  expect(evaluateSession({ id: 'u1', sid: 's' }, db())).toBeNull())
it('rejects a sessionVersion mismatch', () => expect(evaluateSession(claims({ sessionVersion: 0 }), db({ sessionVersion: 1 }))).toBeNull())
it('rejects a deactivated user', () => expect(evaluateSession(claims(), db({ status: 'DEACTIVATED' }))).toBeNull())
it('rejects an INVITED user', () => expect(evaluateSession(claims(), db({ status: 'INVITED' }))).toBeNull())
it('rejects when the company is deactivated', () =>
  expect(evaluateSession(claims(), db({ company: { kind: 'INTERNAL', status: 'DEACTIVATED' } }))).toBeNull())
it('rejects when the token company differs from the DB', () => expect(evaluateSession(claims({ companyId: 'other' }), db())).toBeNull())
it('rejects a deleted user', () => expect(evaluateSession(claims(), null)).toBeNull())
it('ADMIN on a client company is never platform admin', () =>
  expect(evaluateSession(claims({ accountKind: 'CLIENT' }), db({ role: 'ADMIN', company: { kind: 'CLIENT', status: 'ACTIVE' } }))?.isPlatformAdmin).toBe(false))
it('kind comes from the DB, not the token', () =>
  expect(evaluateSession(claims({ accountKind: 'STAFF' }), db({ company: { kind: 'CLIENT', status: 'ACTIVE' }, role: 'REVIEWER' }))).toBeNull())
```

- [ ] **Step 2: Run `npm test` and confirm it fails.**
- [ ] **Step 3: Implement `evaluateSession` and `getActiveSession`.**
  - `mfaEnabled` comes from the DB row.
  - `mfaVerified` comes from the claims. It's only ever set through the proof path in `auth.ts`.
  - A token whose `accountKind` disagrees with the DB-derived kind is rejected.
- [ ] **Step 4: Update `authorize` in `auth.ts`.**
  - Look up the user by `normalizeEmail(email)`, including `company`.
  - Return `null` unless `status === 'ACTIVE'`, `company.status === 'ACTIVE'` and `passwordHash` is set.
  - Keep the rate limit, keyed on the normalized email. Return the new fields.
- [ ] **Step 5: Update `auth.config.ts` `jwt`.**
  - When `user` is present, copy `companyId`, `accountKind`, `isPlatformAdmin` and `sessionVersion`.
  - Update the `session` callback to expose `companyId`, `accountKind` and `isPlatformAdmin`.
- [ ] **Step 6: Update the `jwt` update branch in `auth.ts`.**
  - Also re-read `companyId`, `company.kind`, `role` and `status`. Re-derive `accountKind` and `isPlatformAdmin`.
  - **Do not** touch `token.sessionVersion`.
  - If the user isn't `ACTIVE`, return `null`.
- [ ] **Step 7: Verify** that `npm test`, `tsc` and lint all pass.

---

### Task 3: API wall — `withAuth` audience, platform admin, MFA enrollment

**Files:**
- Modify: `src/lib/rbac.ts` (`withAuth`, around lines 59–76; remove the unused `role` option and `hasRole`/`ROLE_RANK`, keep `type Role`)
- Modify: `src/app/api/mfa/verify/route.ts`, `src/app/api/mfa/setup/route.ts` (option objects)
- Delete: `src/app/api/mfa/disable/route.ts`
- Test: `test/with-auth.test.ts`, `test/api-coverage.test.ts`

**Interfaces:**
- Consumes: `getActiveSession`, `ActiveSession` (Task 2).
- Produces:
  - `export type Audience = 'staff' | 'client' | 'any'`
  - `export interface WithAuthOptions { audience?: Audience /* default 'staff' */; platformAdmin?: boolean; skipMfaCheck?: boolean; allowUnenrolled?: boolean }`
  - `export type AuthedSession = Session & { user: …existing…; active: ActiveSession }` (existing handler signatures unchanged)
  - **Check order:** `sameOrigin` → `getActiveSession` (`null` → 401) → enrollment (`!mfaEnabled && !allowUnenrolled` → 403 `MFA enrollment required`) → verification (`mfaEnabled && !mfaVerified && !skipMfaCheck` → 403) → audience (mismatch → 404) → `platformAdmin` (client → 404; staff that isn't admin, or isn't `mfaEnabled && mfaVerified` → 403).

- [ ] **Step 1: Write the failing tests** (`vi.mock('@/lib/session-guard')` and `vi.mock('@/lib/auth')` with `auth` returning a session; GET requests, so `sameOrigin` passes).

```ts
// test/with-auth.test.ts — helper: call(withAuth(okHandler, opts), activeSessionOrNull) → status
it('defaults to staff-only: client gets 404', async () => expect(await call(withAuth(ok), client())).toBe(404))
it('staff passes the default', async () => expect(await call(withAuth(ok), staff())).toBe(200))
it('no active session → 401', async () => expect(await call(withAuth(ok), null)).toBe(401))
it('unenrolled → 403 unless allowUnenrolled', async () => {
  expect(await call(withAuth(ok), staff({ mfaEnabled: false }))).toBe(403)
  expect(await call(withAuth(ok, { audience: 'any', allowUnenrolled: true, skipMfaCheck: true }), staff({ mfaEnabled: false }))).toBe(200)
})
it('enrolled but unverified → 403 unless skipMfaCheck', async () => expect(await call(withAuth(ok), staff({ mfaVerified: false }))).toBe(403))
it('client audience rejects staff with 404', async () => expect(await call(withAuth(ok, { audience: 'client' }), staff())).toBe(404))
it('any audience admits both', async () => {
  expect(await call(withAuth(ok, { audience: 'any' }), client())).toBe(200)
  expect(await call(withAuth(ok, { audience: 'any' }), staff())).toBe(200)
})
it('platformAdmin: client 404, non-admin staff 403, admin 200', async () => {
  expect(await call(withAuth(ok, { platformAdmin: true }), client())).toBe(404)
  expect(await call(withAuth(ok, { platformAdmin: true }), staff({ isPlatformAdmin: false }))).toBe(403)
  expect(await call(withAuth(ok, { platformAdmin: true }), staff({ isPlatformAdmin: true }))).toBe(200)
})

// test/api-coverage.test.ts — every route.ts under src/app/api except api/auth/** and api/session/end contains "withAuth("
it('every API route is wrapped in withAuth', () => expect(unwrappedRoutes()).toEqual([]))
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement the new `withAuth`** per Interfaces.
- [ ] **Step 4: Set the MFA route options.**
  - `verify`: `{ audience: 'any', skipMfaCheck: true }`
  - `setup`: `{ audience: 'any', skipMfaCheck: true, allowUnenrolled: true }`
  - Delete `mfa/disable/route.ts`.
- [ ] **Step 5: Verify** that `npm test`, `tsc` and lint pass. `grep -rn "api/mfa/disable" src` should return nothing; if `SettingsClient` still references it, Task 6 replaces it.

---

### Task 4: Scoped tenant data layer

**Files:**
- Create: `src/lib/tenancy.ts`
- Test: `test/tenancy.test.ts` (uses `testDb`, `resetData`)

**Interfaces:**
- Consumes: `ActiveSession` (Task 2), `testDb` (Task 1).
- Produces:
  - `export const TENANT_OWNED_MODELS: readonly Prisma.ModelName[] = []` (Projects will be the first entry)
  - `export type TenantContext = { userId: string; companyId: string; accountKind: AccountKind; isPlatformAdmin: boolean }`
  - `export function getTenantContext(active: ActiveSession): TenantContext`
  - `export class TenantScopeError extends Error {}`
  - `export function scopedClient<C extends PrismaClient>(client: C, companyId: string, models: readonly string[])` returns `client.$extends(...)`
  - `export function tenantDb(ctx: TenantContext, opts?: { actingForCompanyId?: string })`
    - **Client:** scoped to `ctx.companyId`. Passing `actingForCompanyId` throws.
    - **Staff:** `actingForCompanyId` is **required**, otherwise it throws `TenantScopeError`.
    - Uses the app `prisma` and `TENANT_OWNED_MODELS`.
  - `export async function getOwnCompany(ctx: TenantContext): Promise<{ id: string; name: string }>`

- [ ] **Step 1: Write the failing tests** (two client companies, A and B, each with a user, created via `testDb`; scope `User` by passing `['User']` as the model list).

```ts
it('findMany only returns the scoped company rows', async () =>
  expect((await scopedClient(testDb, A, ['User']).user.findMany()).map(u => u.companyId)).toEqual([A]))
it('findUnique of another company row returns null', async () =>
  expect(await scopedClient(testDb, A, ['User']).user.findUnique({ where: { id: userOfB } })).toBeNull())
it('update/delete of another company row affects nothing', async () => {
  await expect(scopedClient(testDb, A, ['User']).user.update({ where: { id: userOfB }, data: { name: 'x' } })).rejects.toThrow()
  expect((await scopedClient(testDb, A, ['User']).user.deleteMany({ where: { id: userOfB } })).count).toBe(0)
})
it('create forces companyId and rejects a foreign one', async () => {
  expect((await scopedClient(testDb, A, ['User']).user.create({ data: newUser() })).companyId).toBe(A)
  await expect(scopedClient(testDb, A, ['User']).user.create({ data: newUser({ companyId: B }) })).rejects.toThrow(TenantScopeError)
})
it('count/aggregate are scoped', async () => expect(await scopedClient(testDb, A, ['User']).user.count()).toBe(1))
it('models not in the list are untouched', async () => expect(await scopedClient(testDb, A, []).user.count()).toBeGreaterThan(1))
it('staff must name a client to act for', () => expect(() => tenantDb(staffCtx)).toThrow(TenantScopeError))
it('clients cannot act for another company', () => expect(() => tenantDb(clientCtx, { actingForCompanyId: B })).toThrow(TenantScopeError))
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement `scopedClient`** with `query.$allModels.$allOperations`, for models in the list:
  - **Reads, updates and deletes** (`findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `count`, `aggregate`, `groupBy`, `update`, `updateMany`, `delete`, `deleteMany`): merge `companyId` into `args.where`, using `AND` if `where.companyId` is already set to something else, so the result is always restricted.
  - **Creates** (`create`, `createMany`, `upsert`): set `data.companyId` (and `create.companyId` for upsert). Throw `TenantScopeError` if a different value was supplied.
  - **Anything else on a listed model:** throw.
- [ ] **Step 4: Implement `tenantDb`, `getTenantContext` and `getOwnCompany`** (a plain `prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { id, name } })`).
- [ ] **Step 5: Verify** that `npm test` and `tsc` pass.

---

### Task 5: Page wall — guards, proxy, session-end route, layouts, portal

**Files:**
- Create: `src/lib/guards.ts`, `src/app/api/session/end/route.ts`
- Modify: `src/lib/auth-redirect.ts` (add `CLIENT_ALLOWED_PREFIXES`, `ENROLLMENT_ALLOWED_PREFIXES`, `SESSION_END_PATH = '/api/session/end'`)
- Modify: `src/proxy.ts`
- Create: `src/components/shell/StaffShell.tsx` (server; fetches departments, renders `Sidebar` + main), `src/components/shell/PortalShell.tsx` (server; top bar: `ZimplixioMark`, company name, Settings link, Sign out via a small client button using `signOutDeliberately`)
- Modify: `src/app/(dashboard)/layout.tsx` → `await requireStaff()` then `<StaffShell>`
- Create: `src/app/(portal)/layout.tsx` (`requireClient` + `PortalShell`), `src/app/(portal)/portal/page.tsx`
- Create: `src/styles/app.css` (portal-shell classes); add `@import "../styles/app.css";` in `globals.css`
- Test: `test/guards.test.ts`, `test/proxy-rules.test.ts`

**Interfaces:**
- Consumes: `getActiveSession`, `ActiveSession` (Task 2), `getTenantContext`, `getOwnCompany` (Task 4), `authUrl` (existing).
- Produces:
  - `src/lib/guards.ts`:
    - `export type Need = 'signedIn' | 'staff' | 'client' | 'platformAdmin'`
    - `export type AccessDecision = { ok: true; active: ActiveSession } | { redirect: string } | { notFound: true }`
    - `export function decideAccess(active: ActiveSession | null, need: Need): AccessDecision` (pure)
    - `requireSignedIn()`, `requireStaff()`, `requireClient()`, `requirePlatformAdmin()`: each `Promise<ActiveSession>`, calling `redirect()` or `notFound()` on failure.
  - `decideAccess` rules, in order:
    1. `null` → redirect `SESSION_END_PATH`
    2. `!mfaEnabled` → `/setup-mfa`
    3. `!mfaVerified` → `/verify-mfa`
    4. `staff` need with a client → `/portal`
    5. `client` need with staff → `/`
    6. `platformAdmin` need: client → notFound; staff that isn't admin → notFound
  - `src/lib/auth-redirect.ts`:
    - `export const CLIENT_ALLOWED_PREFIXES = ['/portal', '/settings', '/setup-mfa', '/verify-mfa', '/login']`
    - `export const ENROLLMENT_ALLOWED_PREFIXES = ['/setup-mfa', '/login']`
    - `export function clientMayVisit(pathname: string): boolean` (prefix match on whole segments: `/portal`, `/portal/x`, but not `/portalx`)
    - `export function enrollmentMayVisit(pathname: string): boolean`
  - **`GET /api/session/end`:** calls `signOut({ redirectTo: authUrl('/login', <origin>, { sessionEnded: true }).pathname + search })` from `@/lib/auth`. It isn't wrapped in `withAuth` (a listed exception in the Task 3 coverage test) and is safe to hit unauthenticated.

- [ ] **Step 1: Write the failing tests.**

```ts
// test/guards.test.ts
it('no session → session-end route (breaks the proxy/login loop)', () => expect(decideAccess(null, 'staff')).toEqual({ redirect: '/api/session/end' }))
it('unenrolled → setup-mfa', () => expect(decideAccess(staff({ mfaEnabled: false }), 'staff')).toEqual({ redirect: '/setup-mfa' }))
it('unverified → verify-mfa', () => expect(decideAccess(staff({ mfaVerified: false }), 'signedIn')).toEqual({ redirect: '/verify-mfa' }))
it('client on staff area → portal', () => expect(decideAccess(client(), 'staff')).toEqual({ redirect: '/portal' }))
it('staff on portal → home', () => expect(decideAccess(staff(), 'client')).toEqual({ redirect: '/' }))
it('admin area hidden from clients and non-admin staff', () => {
  expect(decideAccess(client(), 'platformAdmin')).toEqual({ notFound: true })
  expect(decideAccess(staff({ isPlatformAdmin: false }), 'platformAdmin')).toEqual({ notFound: true })
})
it('signedIn admits both kinds', () => {
  expect(decideAccess(client(), 'signedIn')).toMatchObject({ ok: true })
  expect(decideAccess(staff(), 'signedIn')).toMatchObject({ ok: true })
})

// test/proxy-rules.test.ts
it('client allow-list matches whole segments', () => {
  for (const p of ['/portal', '/portal/a', '/settings', '/setup-mfa', '/verify-mfa']) expect(clientMayVisit(p)).toBe(true)
  for (const p of ['/', '/departments/product-research', '/portalx', '/admin', '/settingsx']) expect(clientMayVisit(p)).toBe(false)
})
it('enrollment allow-list', () => {
  expect(enrollmentMayVisit('/setup-mfa')).toBe(true)
  expect(enrollmentMayVisit('/settings')).toBe(false)
})
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement `guards.ts` and the `auth-redirect.ts` additions**, plus the session-end route.
- [ ] **Step 4: Update `proxy.ts`.** The matcher stays as-is, so `/api` and `_next` are excluded.
  - Treat `isLoggedIn` as `!!req.auth?.user?.accountKind` (Review Focus #2).
  - After the existing MFA-verify redirect:
    1. If logged in and `mfaEnabled === false` and `!enrollmentMayVisit(path)` → redirect `/setup-mfa`.
    2. A client on a path that fails `clientMayVisit` → redirect `/portal`.
    3. Staff on `/portal…` → redirect `/`.
  - Keep `authUrl` / `returnTo` behavior for signed-out redirects.
- [ ] **Step 5: Create the shells and layouts.**
  - Move the department fetch from `(dashboard)/layout.tsx` into `StaffShell`.
  - The portal page shows the company name (`getOwnCompany`) and the empty state copy *"Your projects with Zimplixio will appear here."*
  - All styling comes from tokens or classes in `src/styles/app.css`.
- [ ] **Step 6: Verify** that `npm test`, `tsc`, lint and `npm run build` pass, and that `/portal` appears in the build output as dynamic.

---

### Task 6: Settings in either shell, mandatory-MFA UI

**Files:**
- Move: `src/app/(dashboard)/settings/page.tsx` and `SettingsClient.tsx` → `src/app/(account)/settings/`
- Create: `src/app/(account)/layout.tsx` (`requireSignedIn()`, then `StaffShell` or `PortalShell` by `active.accountKind`)
- Modify: `SettingsClient.tsx`: remove the disable flow (state, `handleDisable`, buttons, `update` call, `/api/mfa/disable` fetch). Show the title "Two-factor authentication", the existing description line, and the status **"Enabled — required for every account"**. Remove the enable link: an unenrolled user can't reach Settings. Rewrite its styles to token classes (no `style={{}}`).
- Modify: `src/app/(auth)/setup-mfa/SetupMfaClient.tsx`: the footer shows **"Sign out"** (`signOutDeliberately`) instead of "Back to settings". Enrollment is now always mandatory, so the back link has no valid destination.
- Modify: `src/styles/app.css` (settings card classes, if not covered by `.soft-card`)

**Interfaces:**
- Consumes: `requireSignedIn`, `StaffShell`, `PortalShell` (Task 5), `signOutDeliberately` (existing).

- [ ] **Step 1: Move the files and create the `(account)` layout.**
  - The `settings/page.tsx` server component keeps reading `mfaEnabled` from Prisma for display.
  - Remove its own `auth()` redirect; the layout guards it.
- [ ] **Step 2: Apply the `SettingsClient` and `SetupMfaClient` changes** above.
- [ ] **Step 3: Verify.**
  - `tsc`, lint and `npm test` pass.
  - `grep -rn "mfa/disable\|handleDisable" src` returns nothing.
  - `grep -n "style={{" "src/app/(account)/settings/SettingsClient.tsx"` returns nothing.

---

### Task 7: Interim admin CLI, live verification, docs

**Files:**
- Create: `scripts/access-admin.ts`. Add the npm script `"access": "tsx --env-file=.env scripts/access-admin.ts"`.
- Modify: `docs/SECURITY.md`, `CLAUDE.md`, `docs/GOTCHAS.md`, `README.md`, and the spec's step-1 status line.
- Live check: scripts in the session scratchpad, not committed.

**Interfaces:**
- Consumes: `assertAccountRules`, `normalizeEmail` (Task 1). Uses Prisma directly.
- Produces CLI subcommands, each printing a one-line result and exiting non-zero on any `AccountRuleError`:
  - `create-client --company "<name>" --email <e> --name "<n>" --password <p>`: upserts a `CLIENT` company by name, then creates an `ACTIVE` user with a bcrypt(12) hash and `mfaEnabled=false` (they'll be forced to enroll).
  - `deactivate-user --email <e>`, `reactivate-user --email <e>`, `bump-session --email <e>`: each increments `sessionVersion` (reactivate only flips status).
  - `deactivate-company --name "<n>"`: sets the status and bumps `sessionVersion` for all members.

- [ ] **Step 1: Implement the CLI.** It refuses to touch the internal company's status.
- [ ] **Step 2: Run the live verification** (`next dev` on port 3000, local DB):
  1. Owner-equivalent staff test user (created via script in the internal company, MFA enrolled through the mocked-proof technique from previous sessions):
     - every existing page returns 200
     - every internal API returns its normal status
     - `/portal` redirects to `/`
     - `/settings` shows the staff sidebar and no disable button
  2. Client test user (`npm run access -- create-client --company "Test Client Co" --email client@example.com …`):
     - login is forced to `/setup-mfa`
     - after enrollment (mocked proof), `/portal` shows "Test Client Co"
     - `/`, `/departments/product-research` and `/departments/product-research/findings` redirect to `/portal`
     - `/admin` redirects to `/portal` (the proxy). The guard's 404 is covered by tests.
     - `GET /api/findings/x`, `POST /api/findings`, `POST /api/research/run` and `POST /api/research-probe/run` all return **404**
     - `/settings` renders inside the portal shell
     - sign-out works
  3. `npm run access -- bump-session --email client@example.com`: the next page load lands on `/login?reason=session-ended`, with no loop.
  4. `deactivate-company --name "Test Client Co"`: login fails with the generic error.
  5. Clean up: delete the test users and company, and clear their `RateLimit` rows.
- [ ] **Step 3: Update the docs.**
  - `SECURITY.md`: companies, the account kinds, the wall (proxy + guards + `withAuth` audience defaults), revocation via `sessionVersion`, mandatory MFA, no self-disable.
  - `CLAUDE.md`: the status line, plus new rules for `withAuth` defaulting to staff, guards in layouts only, `tenantDb` as the only path to tenant data, and `npm test`.
  - `GOTCHAS.md`: a new entry, "proxy and guards disagree → redirect loop; end the session via `/api/session/end`", and a new entry on the `_test` database guard.
  - `README.md`: the Testing section now has Vitest; the Known Gaps entry for user management changes from "next" to "in progress". Also note the interim CLI under Admin.
- [ ] **Step 4: Final verification.**
  - `rm -rf node_modules && npm ci && npm run build` (dependency added) passes.
  - `npm test` passes.
  - `tsc` is clean.
  - Report the live-check results to the owner, with the commit commands.
