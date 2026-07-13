# Security — Zimplixio Office

This document describes the current authentication, authorization, validation, and rate-limiting model. It also flags known gaps that are intentionally deferred. See the external CRM v2 Security doc (referenced in `CLAUDE.md`) for the fuller v2 security spec (audit logging, dependency hygiene, threat model) as it gets built out.

## Authentication

- **Provider:** NextAuth v5 (beta) with the Credentials provider only.
- **Password hashing:** `bcryptjs`. Hashes stored in `User.passwordHash`.
- **Session:** JWT strategy. The token carries `id`, `role`, `mfaEnabled`, `mfaVerified`, and `mfaSecret`.
- **MFA:** TOTP via Twilio Verify Service. After login, `mfaVerified` starts at `false`; the user is forced to `/verify-mfa` by `src/proxy.ts` (Next.js's middleware entry point) until they submit a correct 6-digit code. Enforcement isn't page-only: `withAuth` (see Authorization below) independently enforces `mfaEnabled && !mfaVerified → 403` on every wrapped API route by default, so a password-only session can't reach a mutating endpoint directly even if it never visits a page.
- **Session cookie:** NextAuth defaults — `httpOnly`, `secure` in production, `sameSite=lax`.

## Authorization (RBAC)

- **Roles:** `ADMIN`, `REVIEWER` (Prisma enum, source of truth).
- **Wrapper:** `withAuth(handler, { role?, skipMfaCheck? })` in `src/lib/rbac.ts` enforces session presence, role, and (by default) MFA verification on every wrapped handler. ADMIN implies all REVIEWER permissions (rank-based check, see `hasRole`).
- **MFA at the API layer:** unless a route passes `skipMfaCheck: true`, `withAuth` rejects any request where `session.user.mfaEnabled && !session.user.mfaVerified` with a 403. Only `POST /api/mfa/setup` and `POST /api/mfa/verify` opt out — they're how a session becomes verified in the first place, so exempting them is what keeps MFA enrollment/verification from locking itself out. `POST /api/mfa/disable` deliberately does **not** opt out: turning off your own second factor requires an already-MFA-verified session.
- **Currently ADMIN-only:** nothing — no route uses `{ role: 'ADMIN' }` yet.
- **REVIEWER+ (i.e. any authenticated user):** `POST /api/mfa/setup`, `POST /api/mfa/verify`, `POST /api/mfa/disable`, `PATCH /api/company-profile`, `PATCH /api/guidance-summary`, `POST /api/findings`, `GET/PATCH /api/findings/[id]`, `POST /api/research/run`, `GET /api/research/run/[jobId]`, `POST /api/research-probe/run` (the separate Research Probe feature — see `CLAUDE.md`'s CRM v2 section). No role-gating on the Product/Research artifacts — the team is two people and nothing in the v2 docs calls for restricting them.
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

- **No signup or password-reset flow.** Acceptable while the site is single-user; users are seeded via `prisma/seed.ts`. Adding teammates today requires DB access. Build-out is part of any future onboarding work.
- **`mfaVerified` token lifetime.** After `/api/mfa/verify` succeeds, the verify-mfa page calls `useSession().update({ mfaVerified: true })` which re-issues the JWT cookie via the `jwt` callback's `update` trigger (see `src/lib/auth.config.ts`). The flag then lives for the rest of the JWT's lifetime — NextAuth does not auto-expire MFA verification, so a stolen JWT remains MFA-verified until the cookie itself expires. Mitigation: keep `NEXTAUTH_SECRET` private and rotate periodically; consider re-verification on sensitive admin actions in a later phase.
- **No password strength enforcement.** The seed script and any future signup must enforce a minimum policy (length ≥ 12, mixed character classes). Not urgent at single-user scale.
- **No audit log yet.** The v2 security doc calls for a light Postgres audit table (logins, MFA failures, Finding approve/reject decisions) — not built yet. Until then, only application logs (`src/lib/logger.ts`, `pino`) record who did what.
- **CSP is report-only.** Will be flipped to enforcing once we confirm no console violations in normal use.

## Operational notes

- **Locking yourself out:** if RBAC changes break access, use the Railway shell to open `npx prisma studio` and flip the affected user's `role` to `ADMIN`. A `npm run promote-admin <email>` helper should be added before this surface is shared with another human.
- **Monitoring:** structured logging is live — `src/lib/logger.ts` (pino, with the redaction list described above) is fully wired. Unhandled route errors funnel through `toApiError()` (`src/lib/errors.ts`), which logs via `logger.error({ err, context }, 'unhandled API error')` — not `console.error`. A repo-wide grep confirms zero `console.error` calls remain in `src/app/api` or `src/lib`.
