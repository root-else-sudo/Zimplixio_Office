# Security — Zimplixio Office

This document describes the current authentication, authorization, validation, and rate-limiting model. It also flags known gaps that are intentionally deferred. See the external CRM v2 Security doc (referenced in `CLAUDE.md`) for the fuller v2 security spec (audit logging, dependency hygiene, threat model) as it gets built out.

## Companies and account kinds (Access Management step 1)

- Every user belongs to exactly one `Company`. A company is `INTERNAL` (Zimplixio itself, id `internal-zimplixio`) or `CLIENT`, and is `ACTIVE` or `DEACTIVATED`.
- Account kind is **derived from the company**, never stored or trusted from the token: internal company means `STAFF`, client company means `CLIENT`. `assertAccountRules()` (`src/lib/accounts.ts`) enforces the invariants wherever accounts are created: staff must use the staff email domain, clients must not, and clients can never be `ADMIN`. `ADMIN` means platform admin and is valid for staff only.
- Staff see the internal CRM. Clients see only `/portal` (their company name) and `/settings`. Staff can see every client for now; restricting that is a later step.
- Tenant data access goes through `tenantDb` (`src/lib/tenancy.ts`), the only sanctioned path to client-owned models. It currently covers no client-data models; the first one (Projects) must be added to its list.

## The wall (deny by default)

Three independent layers, so a bug in one does not open the others:

1. **Proxy** (`src/proxy.ts`, Node runtime): on every logged-in page request except `/login` it first runs a DB-backed session check (`isSessionStillActive` in `src/lib/proxy-session.ts`, using `evaluateSession` from `src/lib/session-eval.ts`) before any MFA, enrollment or kind redirect. An invalid session, or a database error, redirects to `/api/session/end`. Then a client-kind session may only reach `/portal`, `/settings`, `/setup-mfa`, `/verify-mfa`, `/login` (and auth/session API routes); anything else redirects to `/portal`.
2. **Page guards** (`src/lib/guards.ts`: `requireStaff`, `requireClient`, `requireSignedIn`, `requirePlatformAdmin`). They are DB-backed (`getActiveSession()` in `src/lib/session-guard.ts`) and live in the `layout.tsx` **and** `template.tsx` of each route group (`(dashboard)`, `(portal)`, `(account)`). This is defense in depth, not the revocation boundary (see below). A failed guard sends the user to `/api/session/end`, which clears the session cookie and lands on `/login?reason=session-ended`.
3. **API wrapper:** `withAuth` is **staff-only by default**. A client calling a staff API gets a **404** (the route's existence is not revealed). Routes meant for both kinds must opt in with `audience: 'any'` (only the MFA routes do). `test/api-coverage.test.ts` fails if any route handler is not wrapped.

## Immediate revocation

- `User.sessionVersion` is copied into the JWT at login. `getActiveSession()` and `withAuth` compare it to the database on every request, so a bump invalidates every live session of that user at once. Deactivating a user, or a user's company, also fails the same check. Tokens issued before this feature (no `sessionVersion`) are treated as ended.
- The `jwt` callback deliberately never refreshes `sessionVersion` from the database, since that would heal a revoked token.
- Interim operations: `npm run access -- bump-session|deactivate-user|reactivate-user|deactivate-company` (see README, Admin).
- **Per-request revocation layer:** the proxy DB check above. Layouts and templates do not re-run for soft navigation between pages inside one route group, so a layout or template guard alone is not a revocation boundary (found in live testing, fixed by the proxy check). Client-side navigations still issue a server request, which passes through the proxy. Live-verified: department to department, Product/Research tab to tab, and department to `/settings` after `bump-session` all land on `/login?reason=session-ended` with no redirect loop.

## Mandatory MFA

- MFA is required for every account. An unenrolled user is held at `/setup-mfa` by the proxy and by the guards, and a verified-less session is held at `/verify-mfa`.
- There is no self-service disable: `/api/mfa/disable` was removed and `/settings` shows MFA status only. A lost authenticator is handled by an admin (admin "reset MFA" arrives in step 2).

## Authentication

- **Provider:** NextAuth v5 (beta) with the Credentials provider only.
- **Password hashing:** `bcryptjs`. Hashes stored in `User.passwordHash`.
- **Session:** JWT strategy. The token carries `id`, `role`, `companyId`, `accountKind`, `sessionVersion`, `isPlatformAdmin`, `mfaEnabled`, `mfaVerified`, `mfaSecret`, and `sid` (a random per-login session id that MFA proofs are bound to).
- **MFA:** TOTP via Twilio Verify Service. After login, `mfaVerified` starts at `false`; the user is forced to `/verify-mfa` by `src/proxy.ts` (Next.js's middleware entry point) until they submit a correct 6-digit code. **The session can only become verified through a server-signed proof** (`src/lib/mfa-proof.ts`): `/api/mfa/verify` and `/api/mfa/setup` return one only after Twilio approves the code. It is an HMAC bound to the user id and the session's `sid`, and it expires after 2 minutes. On every `useSession().update()`, `src/lib/auth.ts` ignores client-claimed flags: it re-reads `mfaEnabled` from the database and sets `mfaVerified: true` only for a valid proof. Clients may only lower `mfaVerified` to `false`. This closed a bypass, fixed 2026-11-19, where a password alone plus `update({ mfaVerified: true })`, or `update({ mfaEnabled: false })`, got past MFA. Enforcement isn't page-only: `withAuth` (see Authorization below) independently enforces `mfaEnabled && !mfaVerified → 403` on every wrapped API route by default, so a password-only session can't reach a mutating endpoint directly even if it never visits a page.
- **Session cookie:** NextAuth defaults — `httpOnly`, `secure` in production, `sameSite=lax`.

## Authorization (RBAC)

- **Roles:** `ADMIN`, `REVIEWER` (Prisma enum, source of truth).
- **Wrapper:** `withAuth(handler, { audience?: 'staff'|'client'|'any' (default 'staff'), platformAdmin?, skipMfaCheck?, allowUnenrolled? })` in `src/lib/rbac.ts` enforces session presence, audience and (by default) MFA enrollment and verification on every wrapped handler. `platformAdmin` is the admin gate: a client gets 404; staff that isn't a platform admin, or isn't MFA-enrolled and verified, gets 403. The MFA gate reads the DB-backed `active` session (`getActiveSession`), not `session.user`.
- **MFA at the API layer:** unless a route passes `skipMfaCheck: true`, `withAuth` rejects any request where `active.mfaEnabled && !active.mfaVerified` (the DB-backed active session) with a 403. Only `POST /api/mfa/setup` and `POST /api/mfa/verify` opt out — they're how a session becomes verified in the first place, so exempting them is what keeps MFA enrollment/verification from locking itself out. `/api/mfa/setup` refuses (403) for both `create` and `verify` whenever MFA is **already** enabled, even for a verified session: re-enrollment over an existing factor is not possible, and an admin reset (step 2) is the recovery path. Otherwise a password alone, or a stolen session, could enroll a new authenticator over the existing one (first closed 2026-11-19). `/api/mfa/disable` no longer exists (MFA is mandatory).
- **Currently platform-admin-only:** nothing — no route uses `{ platformAdmin: true }` yet.
- **REVIEWER+ (i.e. any authenticated user):** `POST /api/mfa/setup`, `POST /api/mfa/verify` (audience `any`), and, for staff only, `PATCH /api/company-profile`, `PATCH /api/guidance-summary`, `POST /api/findings`, `GET/PATCH /api/findings/[id]`, `POST /api/research/run`, `GET /api/research/run/[jobId]`, `POST /api/research-probe/run` (the separate Research Probe feature — see `CLAUDE.md`'s CRM v2 section). No role-gating on the Product/Research artifacts — the team is two people and nothing in the v2 docs calls for restricting them.
- **Public:** `/api/auth/[...nextauth]` (NextAuth's own routes).

## Input validation

- All mutating endpoints validate request bodies with Zod via `parseJson(req, schema)` from `src/lib/validate.ts`. A failure returns a 400 with a `VALIDATION_ERROR` code and per-field issues.
- Schemas live inline in the route file for now. They will move to `src/lib/ai/schemas.ts` and friends as those subsystems grow.

## Error responses

- All thrown errors funnel through `toApiError(err, context)` in `src/lib/errors.ts`. Unknown errors are logged server-side and the client receives a generic `INTERNAL_ERROR` with HTTP 500.
- Error response shape is consistent: `{ error: string, code: ApiErrorCode, issues?: [...] }`.

## Rate limiting

- Postgres-backed fixed-window limiter in `src/lib/ratelimit.ts`.
- Persisted in the `RateLimit` model (key + count + windowStart).
- Applied at:
  - Login itself — `src/lib/auth.ts`'s credentials `authorize()` — 5 attempts / 15 min / email, checked before the password comparison. A rate-limited attempt returns `null`, identical to a wrong password, so it never reveals to an attacker that they've been throttled.
  - `POST /api/mfa/verify` — 5 attempts / 15 min / userId.
  - `POST /api/research/run` — 1 run / 5 min / userId (paid-API-triggering).
  - `POST /api/research-probe/run` — 1 run / 2 min / userId (also paid-API-triggering; shorter window since its actual usage pattern is testing several companies back-to-back in one sitting, not a single weekly-cadence trigger).
- Not applied to the Company Profile / Findings / Guidance Summary routes — they're plain DB writes, not paid-API-triggering, so this matches the v2 security doc's guidance (rate limit login/MFA and anything that triggers paid API calls). This guidance is now fully implemented across every paid-API route in the app, not just aspirational.
- 429 responses include a `Retry-After` header (seconds).
- Upgrade path: switch to `@upstash/ratelimit` (Redis) if Postgres write contention becomes a problem. For a small admin site this is unlikely.

## CSRF defense

- The `withAuth` wrapper performs an Origin/Host check on every non-GET/HEAD/OPTIONS request: the `Origin` (or `Referer` fallback) host must match the request `Host` (or `X-Forwarded-Host` if a proxy set one).
- Cross-origin browser POSTs always carry an `Origin`; a missing or mismatched value returns 403.
- This is on top of NextAuth's own CSRF protection on its `/api/auth/*` routes.

## Security headers (`next.config.ts`)

| Header | Value |
|---|---|
| `Content-Security-Policy-Report-Only` | `default-src 'self'`; `script-src` allows `'unsafe-inline'` (and `'unsafe-eval'` in dev); `style-src` allows `'unsafe-inline'` and Google Fonts; `img-src` permissive; `frame-ancestors 'none'`; `form-action 'self'`. Shipped as report-only first; switch to enforcing once browser telemetry confirms no breakages. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (effective only over HTTPS in production). |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | denies camera, microphone, geolocation, payment, usb, interest-cohort. |

The path to a stricter CSP is a nonce-based middleware pattern that drops `'unsafe-inline'` from `script-src` and `style-src`. Deferred — not blocking.

## Known gaps (deferred)

- **No signup, invite or password-reset flow yet.** Accounts are created with the interim CLI (`npm run access -- create-client ...`) or the seed. Admin screens and invite links are step 2, Twilio delivery step 3.
- **`mfaVerified` token lifetime.** After `/api/mfa/verify` succeeds, the verify-mfa page calls `useSession().update({ mfaProof })`, which re-issues the JWT cookie via the `jwt` callback's `update` trigger. The proof is checked in `src/lib/auth.ts`. The flag then lives for the rest of the JWT's lifetime — NextAuth does not auto-expire MFA verification, so a stolen JWT remains MFA-verified until the cookie itself expires. Mitigation: keep `NEXTAUTH_SECRET` private and rotate periodically; consider re-verification on sensitive admin actions in a later phase.
- **No password strength enforcement.** The seed script and any future signup must enforce a minimum policy (length ≥ 12, mixed character classes). Not urgent at single-user scale.
- **Return-to-page after sign-in.** A signed-out visit to a protected page redirects to `/login?callbackUrl=<path>`. The value is carried through `/verify-mfa` and validated by `safeCallbackUrl()` (`src/lib/auth-redirect.ts`), which accepts same-site paths only. It rejects `//host`, `/\\host`, absolute URLs and auth-screen loops, so the login page can't be used as an open redirect.
- **"Session ended" notice.** A non-sensitive marker cookie, `zx_signed_in`, is set after login and cleared only by a deliberate sign-out (`signOutDeliberately()` in `src/lib/sign-out.ts`). If the middleware sees it on a signed-out request, the session expired on its own, and `/login` says so. It carries no identity or secret.
- **No audit log yet.** The v2 security doc calls for a light Postgres audit table (logins, MFA failures, Finding approve/reject decisions) — not built yet. Until then, only application logs (`src/lib/logger.ts`, `pino`) record who did what.
- **CSP is report-only.** Will be flipped to enforcing once we confirm no console violations in normal use.

## Operational notes

- **Locking yourself out:** if RBAC changes break access, use the Railway shell to open `npx prisma studio` and flip the affected user's `role` to `ADMIN`, and check the user's `status` and the company's `status` are `ACTIVE`.
- **Monitoring:** structured logging is live — `src/lib/logger.ts` (pino, with the redaction list described above) is fully wired. Unhandled route errors funnel through `toApiError()` (`src/lib/errors.ts`), which logs via `logger.error({ err, context }, 'unhandled API error')` — not `console.error`. A repo-wide grep confirms zero `console.error` calls remain in `src/app/api` or `src/lib`.
