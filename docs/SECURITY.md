# Security — Zimplixio Office

This document describes the current authentication, authorization, validation, and rate-limiting model. It also flags known gaps that are intentionally deferred. See the external CRM v2 Security doc (referenced in `CLAUDE.md`) for the fuller v2 security spec (audit logging, dependency hygiene, threat model) as it gets built out.

## Authentication

- **Provider:** NextAuth v5 (beta) with the Credentials provider only.
- **Password hashing:** `bcryptjs`. Hashes stored in `User.passwordHash`.
- **Session:** JWT strategy. The token carries `id`, `role`, `mfaEnabled`, `mfaVerified`, and `mfaSecret`.
- **MFA:** TOTP via Twilio Verify Service. After login, `mfaVerified` starts at `false`; the user is forced to `/verify-mfa` by `src/middleware.ts` until they submit a correct 6-digit code.
- **Session cookie:** NextAuth defaults — `httpOnly`, `secure` in production, `sameSite=lax`.

## Authorization (RBAC)

- **Roles:** `ADMIN`, `REVIEWER` (Prisma enum, source of truth).
- **Wrapper:** `withAuth(handler, { role? })` in `src/lib/rbac.ts` enforces session presence and role on every wrapped handler. ADMIN implies all REVIEWER permissions (rank-based check, see `hasRole`).
- **Currently ADMIN-only:** nothing — no route uses `{ role: 'ADMIN' }` yet.
- **REVIEWER+ (i.e. any authenticated user):** `POST /api/mfa/setup`, `POST /api/mfa/verify`, `PATCH /api/company-profile`, `POST /api/findings`, `GET/PATCH /api/findings/[id]`. No role-gating on the Product/Research artifacts — the team is two people and nothing in the v2 docs calls for restricting them.
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
  - `POST /api/mfa/verify` — 5 attempts / 15 min / userId.
- Not yet applied to the Company Profile / Findings routes — they're plain DB writes, not paid-API-triggering, so this matches the v2 security doc's guidance (rate limit login/MFA and anything that triggers paid API calls). Revisit once the Research Agent's "Run now" trigger exists (Increment 3+).
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
- **Monitoring:** structured logging (Phase 2) will land in `src/lib/logger.ts`. Until then, error responses log via `console.error` with a route-prefixed context tag (e.g. `[api] posts.patch:`).
