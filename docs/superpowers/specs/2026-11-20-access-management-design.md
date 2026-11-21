# Access Management (Multi-Tenant) — Design

| Field | Value |
|---|---|
| **Document type** | Design specification |
| **Date** | 2026-11-20 |
| **Status** | Draft for owner review. **Step 1 built and live-verified locally (2026-11-20); pending owner commit.** The in-group soft-navigation finding was fixed with a DB-backed session check in the proxy. |
| **Scope** | Whole module across steps 1–5. Step 1 in full detail; steps 2–3 at design level; steps 4–5 named, out of scope |

> This repository is public. This document deliberately contains no client names, real accounts or credentials.

---

## 1. Intent

Zimplixio Office becomes a **multi-tenant portal**. Zimplixio's clients sign in to follow the progress of their projects with Zimplixio. Zimplixio staff sign in to post updates to those projects, and keep using the internal departments as today.

Security and keeping clients separated are the top priorities. The module should follow industry practice for client portals.

**Why now:** the Projects module, which is what clients will actually use, needs accounts, companies and a hard wall between clients and Zimplixio's internal data. That wall has to exist **before** the first client account does.

Today any signed-in user can open every page and API, including departments, Findings and the Research Probe.

## 2. Goals, non-goals, anti-goals

**Goals**
- Companies (tenants): Zimplixio itself, the single internal company, plus any number of client companies.
- Two kinds of account: **staff**, who always belong to Zimplixio and only use `@zimplixio.com` addresses, and **client users**, who belong to exactly one client company and can use any email domain, Gmail included.
- **A deny-by-default wall.** Client users can only reach their own company's portal and their personal Settings. Every internal page and API is staff-only unless deliberately opened.
- An **Administration** area where the platform admin (the owner) creates, edits and deactivates companies and users, invites users, and sees an activity log.
- **Invite-link onboarding.** The user sets their own password and enrolls MFA, and the link is delivered through Twilio (step 3).
- **Deactivation takes effect immediately**, not when a session token happens to expire.

**Non-goals (for this module)**
- Roles and fine-grained permissions (step 4, designed after this draft).
- Per-client staff assignment ("staff B only works on Acme"). In this module, all staff see all clients (owner decision).
- Project-level access inside a client company (whether a client employee sees only some of their company's projects). That arrives with the Projects module.
- The Projects module itself, and Postgres Row-Level Security (step 5).
- Self-service sign-up. Accounts exist only because the admin created them.
- Single sign-on (Google/Microsoft).

**Anti-goals: things that would make this a failure even if it "works"**
- Any client user seeing internal Zimplixio data, or another client's data, through any page or API.
- Protection that depends on each page or route remembering to add a check. New routes must start closed.
- Sending passwords to anyone, by any channel.
- Hard-deleting users or companies in a way that erases history (updates they posted, the audit trail).
- Per-page styling. The Administration area and portal use the shared design system (CLAUDE.md rule 5).

## 3. Decisions already made (owner)

| Decision | Choice |
|---|---|
| Company membership | Each client user belongs to **exactly one** company. No multi-company accounts and no company picker. |
| Staff identity | Staff are Zimplixio accounts on `@zimplixio.com`. A client's email domain never decides their company; the admin assigns it. |
| Staff reach | All staff can see all clients for now. Restricting that is step 4. |
| Removing access | **Deactivate**, which blocks access instantly and keeps history. A true delete is a separate, deliberate action, not built in this module. |
| Admin | The owner is the only platform admin for now. |
| Placement | A separate **Administration** area (`/admin`), visible only to the platform admin, at the bottom of the sidebar and outside the department "org chart". Personal **Settings** stays separate and is used by every user. |
| Client layout | Client users get their own simpler layout: their company's portal, with no departments sidebar and no Administration link. |
| Tenancy approach | **Approach A** (below). |
| Onboarding | One-time invite links, never passwords. The link is shown on screen in step 2 and delivered through Twilio in step 3. |

## 4. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| **A** | One database. Every client-owned row carries `companyId`, enforced by one scoped data layer in the app, plus deny-by-default route walls. | Protection lives in the app, so that one layer must be the most tested code in the repo. Simple to build and test. | **Chosen.** |
| B | A plus Postgres Row-Level Security. | Strongest, since the database refuses cross-tenant rows even if the app has a bug. But every request must set the acting company, staff need a "see all" exception, and the Worker needs its own handling. | Deferred to step 5. It becomes valuable when the Projects module stores client data, and A is designed so B can be layered on. |
| C | A schema per client. | Strong separation, but migrations run per client and Prisma has no clean support. | Rejected as overkill. |
| — | A database per client | Built for very large or regulated customers; Prisma handles it poorly. | Rejected. |

## 5. Delivery steps

Each step is its own plan, build and manual test round, so each test pass checks one thing.

| Step | What ships | How the owner tests it |
|---|---|---|
| **1. Foundation** | Companies, staff and client accounts, the deny-by-default wall, client portal shell, immediate session revocation, mandatory MFA | Owner login and all internal pages unchanged. A client test account (created by script) sees only an empty portal, and is blocked from every internal page and API. |
| **2. Administration + invite links** | `/admin`: companies, users, activity log. Create, edit and deactivate. Generate an invite link shown on screen. Invite acceptance: set password, enroll MFA. Admin "reset MFA". | Create a company and a user, copy the link, open it in a private window, set a password and MFA, land in the portal. Deactivate the user and see them signed out immediately. |
| **3. Twilio delivery** | Invite links (and resend) sent through Twilio. Password reset over the same channel. | Receive the invite on a real phone or inbox, complete it, then use "Forgot password?" end to end. |
| 4. Roles & permissions | Designed after steps 1–3 exist | — |
| 5. Projects + RLS | Separate design | — |

---

## 6. Step 1 — Foundation (full detail)

### 6.1 Data model

**New `Company`**
- `id`, `name`, `createdAt`, `updatedAt`.
- `kind`: `INTERNAL | CLIENT`. Exactly one `INTERNAL` row (Zimplixio), enforced in the database by a partial unique index on `kind` where `kind = 'INTERNAL'`. Prisma can't express a partial index, so it's added as raw SQL in the migration (my call).
- `status`: `ACTIVE | DEACTIVATED`.

**`User` changes**
- `companyId`: **required**, FK → `Company`.
- `status`: `ACTIVE | INVITED | DEACTIVATED`. `INVITED` is used from step 2 onwards.
- `sessionVersion`: `Int @default(0)`. Bumped whenever access must be cut immediately (deactivation, MFA reset, password change, company deactivated). See 6.4.
- `passwordHash` becomes **nullable**. Invited users have no password until they accept. Login must treat null as "cannot sign in".
- `role` (`ADMIN | REVIEWER`) **stays as-is for now**. In this module `ADMIN` means **platform admin** and is valid only for staff; `REVIEWER` means "regular account". Step 4 replaces this with real roles.
  - *Builder's call:* whether to rename `ADMIN` to something clearer now. If renamed, migrate the existing rows.

**Account kind is derived, never stored twice.** A user is staff if and only if their company's `kind` is `INTERNAL`. There's no separate "user type" column that could disagree with the company.

**Invariants, enforced in code wherever users are created or changed (seed, scripts, step 2 admin APIs):**
- Staff (Zimplixio company) emails must end in `@zimplixio.com`, compared case-insensitively. The reverse isn't required: a client user may use any domain, but **a `@zimplixio.com` address can never be added to a client company**. That prevents a staff address being granted client-only scope by mistake.
- `role = ADMIN` only for staff.
- Emails are unique, stored lower-cased.

### 6.2 Migration

- **One migration:**
  1. Create `Company`.
  2. Insert the Zimplixio `INTERNAL` company.
  3. Add the new `User` columns.
  4. Attach every existing user to Zimplixio.
  5. Then make `companyId` NOT NULL.

  Existing accounts keep working with no action from the owner.
- **Existing accounts (owner-confirmed, 2026-11-20):** the live dev site has exactly one account, the owner's, on `@zimplixio.com` with `role = ADMIN` and MFA enabled. It becomes the Zimplixio platform admin. The local dev database matches.
- **Safety net (my call):** the migration doesn't guess about unexpected data. After attaching users, a check runs and **fails the migration with a clear message** if any user breaks the §6.1 invariants:
  - a non-`@zimplixio.com` email in the internal company
  - more than one `ADMIN`
  - case-insensitive duplicate emails

  Emails are lower-cased in the same migration.
- **Old session tokens (my call):** tokens issued before this deploy lack the new claims (`companyId`, `accountKind`, `sessionVersion`). They're treated as signed out, which means a one-time re-login after deploy.
- **The seed:** creates the Zimplixio company if missing, and attaches the seeded admin to it.
  - The seed's default-credential fallback is a known, deliberately deferred issue (tracked privately). Don't change it in this step.
- Rule 3 applies: `prisma migrate dev`, and the Railway pre-deploy migration runs it on deploy.

### 6.3 Session contents

At login, the JWT gains `companyId`, `accountKind` (`STAFF | CLIENT`, derived as above), `isPlatformAdmin`, `status` and `sessionVersion`, alongside the existing claims.

- **On every `useSession().update()`,** `src/lib/auth.ts` re-reads these from the database, the same pattern already used for `mfaEnabled`. They're never taken from the browser (GOTCHAS #12).
- **`authorize()` refuses sign-in** unless all of these hold:
  - user `status = ACTIVE`
  - company `status = ACTIVE`
  - `passwordHash` is not null

  The error is the same generic message as a wrong password, and the attempt still counts toward the rate limit.

### 6.4 Immediate revocation

A JWT alone can't be revoked, and "deactivation takes effect immediately" is a goal. So:

- **A single server-side check,** `requireActiveSession()`, re-reads the user's `status`, company `status` and `sessionVersion` from the database. It runs on:
  - every authenticated **API** request, inside `withAuth`
  - every authenticated **page** request, inside the server layouts of `(dashboard)`, `(portal)`, `/admin` and `/settings`
- **If the user or company isn't active, or `sessionVersion` differs from the token,** the request is treated as signed out: the API returns 401, and pages redirect to `/login?reason=session-ended`.
- **Cost:** one indexed primary-key read per request. That's acceptable at this scale.

*Builder's call:* caching inside a single request (React `cache()`) to avoid double reads when a layout and page both check.

### 6.5 The wall: routing

Route groups and who may enter:

| Area | Path | Who |
|---|---|---|
| Auth screens | `/login`, `/verify-mfa`, `/setup-mfa` (+ step 2: `/invite/[token]`) | public / mid-sign-in, as today |
| Internal app | `(dashboard)`: `/`, `/departments/**` | **staff only** |
| Client portal | new `(portal)`: `/portal/**` | **client users only** |
| Administration | `/admin/**` (step 2) | **staff + platform admin + MFA verified** |
| Personal settings | `/settings` | everyone signed in. Rendered in the staff shell (sidebar) or the portal shell, by account kind. *My call:* it moves out of the `(dashboard)` group into its own `(account)` group, whose layout picks the shell. |

**Enforced in two layers, both default-deny:**

1. **The proxy (`src/proxy.ts`), as a fast redirect, not the security boundary:**
   - A client user requesting any path outside `/portal/**`, `/settings`, the auth screens and Next internals is redirected to `/portal`.
   - A staff user requesting `/portal/**` is redirected to `/`.
   - `/` redirects by kind: staff to the first built department (as today), clients to `/portal`.
   - The allow-list for clients is explicit. A new top-level route is closed to clients unless it's added to that list.
2. **The server layouts, as the actual boundary:**
   - each area's layout calls one guard (`requireStaff()`, `requireClient()`, `requirePlatformAdmin()`, or `requireSignedIn()` for settings), built on `requireActiveSession()`
   - it redirects or 404s on mismatch
   - pages never implement their own checks

**`/admin` for non-admins returns 404, not 403,** so the area's existence isn't confirmed to clients.

### 6.6 The wall: APIs

- **`withAuth` gains an audience option:** `audience: 'staff' | 'client' | 'any'`, defaulting to **`'staff'`**.
  - Every existing internal route (findings, company profile, guidance, research, research-probe) becomes staff-only **with no edit to those files**.
  - The remaining MFA routes (`/api/mfa/verify`, `/api/mfa/setup`) are marked `'any'`. `/api/mfa/disable` is removed (6.9).
  - Future portal APIs mark themselves `'client'` (or `'any'`) explicitly.
- **`platformAdmin: true`** is a separate option for `/api/admin/**` (step 2).
- **`requireActiveSession()` runs inside `withAuth` for every authenticated route** (6.4).
- **Mismatch returns 404** for client callers of staff routes, so the route's existence isn't revealed, and 403 for staff calling admin routes.
- **Routes outside `withAuth`:** `/api/auth/**` (NextAuth) stays as is. Any new route must use `withAuth` or be explicitly public. *Builder's call:* how to make a forgotten wrapper visible, e.g. a small check that every `route.ts` under `src/app/api` (except `auth`) calls `withAuth`.

### 6.7 The scoped data layer (the core of approach A)

- **One module, `src/lib/tenancy.ts`, is the only way to read or write tenant-owned data:**
  - `getTenantContext(session)` returns `{ userId, companyId, accountKind, isPlatformAdmin }`.
  - `tenantDb(ctx)` returns a Prisma client (via a Prisma Client extension) that, **for every model in a `TENANT_OWNED_MODELS` list**:
    - adds `where: { companyId: ctx.companyId }` to reads, updates and deletes
    - forces `companyId` on creates
    - throws if a caller tries to supply a different `companyId`
- **Staff:** `tenantDb` for staff requires an explicit client `companyId` argument, because staff act *for* a chosen client. There's no implicit "all companies" mode. The Administration area uses a separate, clearly named `adminDb` path that's only available behind `requirePlatformAdmin()`.
- **In step 1, `TENANT_OWNED_MODELS` contains no client-data models yet.** Projects will be the first. The portal's only reads are the user's own company name and profile, which also go through `tenantDb`. The layer is built and tested now, so step 5 just adds models to the list.
- **How to test it before any tenant-owned model exists (my call):** the extension takes its model list as a parameter, and the tests run it against a model list that includes `User`, which has `companyId`. Production passes the real `TENANT_OWNED_MODELS`.
- **Internal models** (Department, Finding, Probe tables and so on) are not tenant-owned. They're protected by the staff-only wall, not by scoping.

### 6.8 Client portal shell (step 1 content)

- **Layout:**
  - a top bar with the Zimplixio mark, the client's company name, a link to Settings, and Sign out
  - no departments sidebar
  - built from the shared tokens and classes (rule 5)
- **`/portal` content:** a welcome plus an empty state, "Your projects with Zimplixio will appear here."
- **Settings in the portal shell:** shows the same MFA card as for staff.

### 6.9 MFA policy (owner decision, 2026-11-20)

**MFA is mandatory for every account, staff and client, starting in step 1.**

- **Forced enrollment:**
  - A signed-in user with `mfaEnabled = false` can reach only:
    - `/setup-mfa`
    - `/api/mfa/setup`
    - the auth screens
    - sign-out
  - Everything else redirects to `/setup-mfa` (pages) or returns 403 `MFA enrollment required` (APIs).
  - This is enforced in the same two layers as the wall: the proxy redirect, plus the guards and `withAuth` as the boundary.
  - It's also the path an account takes after an admin MFA reset (step 2).
- **No self-disable:**
  - The "Disable two-factor authentication" button is removed from Settings for everyone.
  - `POST /api/mfa/disable` is removed. Step 2 replaces it with the admin-only **reset MFA** action.
  - Settings shows MFA status only.
- **`/admin` requires a strictly MFA-verified session** (`mfaEnabled && mfaVerified`). The owner's account is already enrolled on the live dev site, so there's no lockout.
- **`/setup-mfa` back-link:** its existing "Back to settings" link no longer makes sense once enrollment is mandatory (Settings is unreachable until enrolled). It becomes "Sign out" during forced enrollment.
- **Step 2's invite acceptance** includes enrollment, so no account is ever active without MFA.

### 6.10 Testing

- **There's no automated test suite in the repo today.** Because the wall and the scoped data layer are the security boundary, step 1 introduces a **minimal test setup (Vitest)** limited to:
  - `tenantDb` scoping (it can't read, update or create across companies; mismatched `companyId` throws)
  - the guards and `withAuth` audience defaults (client→staff route is 404; default is staff)
  - `requireActiveSession` revocation (status, company status, `sessionVersion`)
  - the staff-domain and admin invariants

  *My call*, because a regression in these is a data leak.
- **The live verification script** (Playwright/curl, as in previous work): with a throwaway client test user created by a script, try every internal page and every internal API, and expect a redirect or 404 for each. The owner's account still reaches everything.

### 6.11 Step 1 done means
- All existing pages and APIs behave unchanged for staff.
- A client test user signs in, sees only `/portal` and `/settings`, and gets a redirect or 404 everywhere else, pages and APIs alike.
- Any account without MFA is held at `/setup-mfa` until enrolled. No one can disable MFA from Settings.
- Bumping a user's `sessionVersion`, or deactivating them or their company, signs them out on their next request.
- The tests above pass. `tsc`, lint and a clean build pass. `docs/SECURITY.md` and CLAUDE.md describe the new model.

---

## 7. Step 2 — Administration + invite links (design level)

- **Area:** `/admin`, behind `requirePlatformAdmin()`, plus an MFA-verified session (already required). Tabs: **Companies · Users · Activity log**, in the shared design system.
- **Companies:**
  - list (name, kind, status, user count)
  - create
  - rename
  - deactivate or reactivate. Deactivating a company bumps every member's `sessionVersion`.
  - The internal company can't be deactivated.
- **Users:**
  - list with a company filter
  - create, which means invite: name, email, company. Staff-domain rules apply.
  - edit name
  - deactivate or reactivate (bumps `sessionVersion`)
  - **reset MFA**, which clears the factor, bumps `sessionVersion`, and sends the user through enrollment at next sign-in. This covers the lost-phone case until recovery codes exist.
  - **reissue invite**
- **Invites (`UserInvite`):**
  - `userId`, `tokenHash` (SHA-256 of a 32-byte random token; the raw token is never stored)
  - `expiresAt` (*proposal:* 72 hours), `usedAt`, `revokedAt`, `createdById`
  - Single use. Issuing a new invite revokes the previous one.
  - In step 2 the link (`/invite/<token>`) is **shown once on screen** for the admin to copy.
- **Accepting an invite (`/invite/[token]`):** the lamp scene, then set password (with a strength rule), then MFA enrollment (the existing setup flow), then the user becomes `ACTIVE` and lands in their area.
  - Invalid, expired or used links show one generic message.
  - The page is rate limited.
- **Activity log (`AuditLog`):**
  - fields: `actorId`, `action` (e.g. `company.created`, `user.deactivated`, `mfa.reset`, `invite.issued`, `invite.accepted`), `targetType`/`targetId`, `companyId`, `metadata` (JSON, no secrets), `createdAt`
  - written in the same transaction as the change
  - read-only list in the admin area
  - This also starts the long-deferred audit-log item. Logins and MFA failures can be added to the same table.

## 8. Step 3 — Twilio delivery (design level)

- Invites (and "resend invite") are delivered through Twilio, with no admin copy and paste.
- **"Forgot password?"** on the login card sends a reset link over the same channel. It reuses the invite-token mechanism (separate purpose, shorter expiry), and always shows the same "if that account exists, we've sent a link" response.
- **Open decision for the owner before step 3 is planned:** the channel.
  - **SMS** needs a phone number per user, consent, and Twilio number registration.
  - **Email via Twilio SendGrid** needs domain authentication (SPF/DKIM) on `zimplixio.com`.
  - **Both** is possible. This adds fields (phone) and setup work, which is why it's decided before planning step 3, not now.

## 9. Constraints

- Stack as today: Next.js 16, Prisma 7 (driver adapter), NextAuth v5 JWT sessions, Twilio Verify for TOTP, Railway.
- `src/lib/auth.config.ts` stays edge-safe, with no Prisma. Database checks live in `auth.ts`, the guards and `withAuth`.
- CLAUDE.md rules apply, especially:
  - 3 (migrations)
  - 4 (human gate, unaffected)
  - 5 (shared styling)
  - 6 (public repo: no real client names in seed, fixtures or docs)
  - 7–9
  - 14–15 (session and redirect trust)
- The owner commits and tests manually after each step. Keep each step's surface small enough to test in one sitting.

## 10. Left to the builder

- File and function names beyond those named here.
- Exactly how the Prisma extension is written.
- Whether to rename `Role.ADMIN` in step 1.
- Per-request caching of the session check.
- How missing `withAuth` wrappers are detected.
- Visual details of the portal shell and admin tables, within the design system.
