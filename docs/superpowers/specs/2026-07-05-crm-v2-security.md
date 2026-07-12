# Zimplixio CRM v2 — Security Specification

| Field | Value |
|---|---|
| **Document Type** | Security Specification |
| **Companion To** | Planning; Design System; Environments & Git Workflow |
| **Version** | 1.0 (draft) |
| **Date Issued** | 2026-07-05 |
| **Owner** | Joe Ugalde |
| **Consumer** | Claude Code (implementation) |
| **Status** | Draft for owner review |

---

## Implementation Status (as of 2026-07-12)

This document is the original security spec — kept as-is below. Status of what it describes:

- **§1 MFA — enforced at both layers now.** Twilio Verify TOTP was already coded but had never been enrolled for the real account, and was only enforced at the page level (middleware redirect), not the API layer — a password-only session could still call every mutating route directly. Both fixed 2026-07-10: `withAuth()` (`src/lib/rbac.ts`) now enforces MFA verification by default on every wrapped API route, and a new `/settings` page lets the owner enroll/disable MFA themselves (no such UI existed before). **Recovery codes are still not built** — no schema, no code — deliberately deferred to its own design conversation rather than bundled into that fix.
- **§2 Session Handling — the "not bypassable by a lingering session" line is now true at the API layer too**, not just pages (same fix as above).
- **§3 API keys — the "never logged" rule had a real bypass, now fixed.** `src/lib/errors.ts` was logging unhandled route errors via raw `console.error`, bypassing the app's pino logger and its secret-redaction rules entirely. Fixed 2026-07-10 to route through the redacting logger.
- **§4 Rate limiting — login is now covered, not just MFA verify.** The login endpoint had zero rate limiting (confirmed live in the 2026-07-09 audit — 4 bad passwords with no pushback). Fixed 2026-07-10: same 5-attempts/15-min window as the existing MFA-verify limiter, returns the same generic error either way so a throttled attempt is indistinguishable from a wrong password.
- **The single most urgent finding from the 2026-07-09 audit — the production admin account's password was the literal seed default (`changeme123`), MFA off, no rate limiting — has been rotated.** This wasn't a gap in this doc's rules, but a live violation of them; fixed 2026-07-10.
- **§5 CSP — still report-only, not yet flipped to enforcing.** Known, not yet actioned.
- **§7 Dependency hygiene — gitleaks pre-commit hook confirmed working live.** `npm audit` currently shows 5 moderate advisories in build/dev-tooling dependency chains (not app runtime surface); the suggested `npm audit fix --force` would downgrade Prisma/Next to incompatible versions, so left alone for now (owner's call, revisit if it becomes a real issue).
- **§8 Audit logging — still not built.** No `AuditLog` table, no code — every login, failed login, MFA event, and Finding approve/reject is currently unrecorded beyond unstructured pino app logs. Deliberately deferred to its own design conversation, same as recovery codes.

---

## 0. What This Document Is

The security ground rules for Zimplixio CRM v2. It is scoped to **industry standard for a single-user internal tool** — enough to keep opportunistic attackers and leaked-key incidents out, without enterprise over-engineering. §9 records what is deliberately *out* of scope and why, so the boundary is a decision, not an oversight.

**Threat model (what this actually defends against):** opportunistic scanners probing exposed endpoints; leaked API keys running up cost or being abused; vulnerable/malicious dependencies; untrusted web content ingested by the research engine. It does **not** attempt to defend against a determined, targeted adversary — that would be over-engineering for this app's size and single-user reality.

---

## 1. Authentication & MFA

Keep V1's approach — it works — with two additions.

- **Base:** NextAuth v5 with a **credentials** provider. No public sign-up; there is no registration route. Users are **provisioned manually** (owner, and optionally Maria Jose). This is a single-user / tiny-team app; keeping the door closed to the public is the single biggest attack-surface reduction.
- **Second factor:** **Twilio Verify TOTP** (kept from V1). Twilio is retained deliberately — already paid for, and the same account will later carry SMS/WhatsApp features, so consolidating on one provider avoids rework.
- **Recovery codes (new):** a set of one-time backup codes generated at MFA enrollment, stored hashed, usable if the enrolled device/number is lost. This closes the one gap in the V1 flow — being permanently locked out of your own CRM with no fallback. Does not change the Twilio setup; it is a parallel recovery path.
- **Passwords:** hashed with a strong adaptive algorithm (bcrypt/argon2); never stored or logged in plaintext.

---

## 2. Session Handling

- Sessions via NextAuth's standard mechanism; session secret (`NEXTAUTH_SECRET`) lives only in environment variables.
- Secure cookie attributes: `HttpOnly`, `Secure`, `SameSite=Lax` (or stricter). Session cookies never readable by client JS.
- Reasonable session lifetime with re-authentication on expiry. MFA is required at login, not bypassable by a lingering session.
- `AUTH_TRUST_HOST` set appropriately behind the Railway/Cloudflare proxy (as in V1).

---

## 3. API Key Security (Claude + Tavily)

These keys are the highest-value asset in the system — a leaked key means someone spending your money at scale. Rules are strict and non-negotiable.

- **Storage:** keys live **only** in Railway environment variables, per environment. **Never** in the repo, never hardcoded, never committed.
- **Never client-exposed:** no key is ever placed in a `NEXT_PUBLIC_*` variable (those ship to the browser). No key is ever referenced from a client component.
- **Server-side only:** all Claude and Tavily calls originate **server-side** — from the Worker and API routes only. This aligns with the architecture: the research engine already runs in the Worker, so a key never has a legitimate reason to be near the browser.
- **Never logged:** keys, and full request/response bodies that might contain them, are kept out of logs and error traces.
- **Lazy initialization:** SDK clients (Anthropic, Twilio) are instantiated at request time via a lazy getter, never at module load — consistent with V1's rule and avoids leaking config into build output.
- **Separate keys per environment** where practical, so a dev-side leak never exposes production usage.

---

## 4. Endpoint Hardening & Rate Limiting

- **Everything behind auth.** The only unauthenticated route is the login page itself. All API routes, all department pages, all engine triggers require an authenticated session.
- **Rate limiting** via the existing **Postgres-based approach** (V1's `RateLimit` table) — no new infrastructure (no Redis). Applied to:
  - the login / MFA endpoints (blunt brute-force and credential-stuffing attempts), and
  - any route that triggers **paid API calls** (e.g. "Run now" for the research engine) — so no one can hammer an endpoint and run up the Claude/Tavily bill.
- **The human-in-the-loop gate is an authorization boundary,** not just a UX step: the agent proposes candidate Findings; only an authenticated owner can validate/approve. Nothing acts externally without that authenticated action.

---

## 5. HTTPS Posture & Security Headers

- **HTTPS everywhere**, enforced (HTTP → HTTPS redirect; V1 already runs behind Cloudflare/Railway with SSL). No mixed content.
- **Security headers** (set in Next.js config — cheap hardening that makes scanners move on):
  - `Strict-Transport-Security` (HSTS) — enforce HTTPS at the browser.
  - `X-Content-Type-Options: nosniff`.
  - `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` — prevent clickjacking (this app is never embedded).
  - A **basic Content-Security-Policy** — start conservative, tighten as the UI settles; the goal is to constrain what can execute/load, not a perfect policy on day one.
  - `Referrer-Policy` and a minimal `Permissions-Policy` as sensible defaults.

---

## 6. Input Validation as a Security Boundary

The Zod validation pattern from the architecture doc doubles as the injection-defense layer.

- **Every external input is validated before it is trusted:** form data, API route payloads, and — importantly — **anything the research engine ingests from Tavily / the open web.**
- The engine ingests **untrusted web content** by design (news, social, communities). That content is treated as data, never as instructions: it is validated/shaped by Zod before entering the DB, and it must never be able to trigger actions, and prompt-injection from scraped content is assumed possible and contained (the human gate is the backstop — scraped content can at most produce a *candidate* Finding, which a human must approve).
- Standard hygiene: parameterized queries via Prisma (no raw string SQL), output encoding in the UI to prevent stored XSS from any ingested text.

---

## 7. Dependency & Supply-Chain Hygiene

For a modern TS app, the most *likely* real compromise is a vulnerable or malicious npm dependency — this is the highest-value, lowest-effort control.

**Owner — already enabled on GitHub (done 2026-07-06):** in repo Settings → Advanced Security:
- **Dependency graph** — on (prerequisite for the rest).
- **Dependabot alerts** — on (flags known-vulnerable dependencies).
- **Dependabot security updates** — on (auto-PRs to patch them).
- **Dependabot malware alerts** — on (flags dependencies turning malicious).
- **Grouped security updates** — on (bundles patch PRs to reduce noise).

*(Dependabot version updates left off deliberately — it PRs for every new version, not just security ones; noise not worth it mid-build. Security updates, which are on, are the ones that matter.)*

**Secret scanning — not used, and why.** GitHub's secret scanning + push protection is free only on **public** repos. This repo is **private**, where it requires paid GitHub Advanced Security — not worth it for a solo internal tool. The "never commit a key" backstop is instead handled locally (below), which works on private repos and blocks secrets *before* they ever reach GitHub.

**Claude Code handles in-code:**
- **Add a `gitleaks` pre-commit hook** — scans staged changes and rejects any commit containing something key-shaped (Anthropic/Tavily/Twilio keys, tokens). This is the local replacement for GitHub secret scanning and directly enforces the §3 "keys never in repo" rule. Set up during initial repo tooling.
- Treat `npm audit` as part of the workflow; keep dependencies current.
- Pin/lock dependency versions (`package-lock.json` committed); avoid adding load-bearing packages casually (consistent with the charter constraint).

**Optional (solo-friendly, owner):** branch protection on `main` via Settings → Rules → Rulesets — require merge from `development`, no direct pushes. Personal convention otherwise; Claude Code will remind if relevant.

---

## 8. Audit Logging & Backups

- **Light audit trail** (a Postgres table, not a SIEM): record security-relevant events — logins, failed logins, MFA challenges/failures, and human-gate approvals/rejections (who approved which Finding, when). This is both a security record and an operational asset for a system where an agent proposes and a human approves.
- **Database backups:** enable Railway's Postgres backups on the production environment (when provisioned); treat recovery from corruption/ransomware as a security control, not just ops. One line: backups on, restore path known.

---

## 9. Explicitly Out of Scope (and Why)

Named deliberately, so the boundary is a decision. These are real controls that would be **over-engineering for a single-user internal CRM** and buy little against this app's threat model:

- **WAF / DDoS protection services** — no public multi-tenant surface to justify them; Cloudflare's baseline is sufficient.
- **Penetration testing / red-teaming** — disproportionate for a solo internal tool.
- **SSO / SAML / OAuth identity federation** — no organization of users to federate.
- **Dedicated secrets-vault infrastructure** (HashiCorp Vault, etc.) — Railway environment variables are the right tool at this scale.
- **Intrusion detection / SIEM** — the light audit table (§8) is the appropriate level.
- **SOC 2 / formal compliance controls** — no external customers or data-processing obligations that require them yet.

Revisit if the app ever becomes multi-tenant, client-facing, or handles third-party customer data — those changes alter the threat model and would pull some of the above back into scope.

---

## 10. Summary — The Locked Rules

- **Auth:** NextAuth v5 + credentials + **Twilio Verify TOTP**, **plus recovery codes**. No public sign-up; users provisioned manually.
- **API keys:** env-vars only, **server-side only**, never in repo / `NEXT_PUBLIC_*` / logs. Separate keys per environment where practical.
- **Everything behind auth**; Postgres-based rate limiting on login and paid-API-triggering routes.
- **HTTPS enforced + standard security headers** (HSTS, nosniff, frame-ancestors, basic CSP).
- **Validate all external input** (Zod); scraped web content is untrusted data, contained by validation + the human gate.
- **Dependency hygiene:** Dependabot alerts + security + malware + grouped updates (owner enabled). Secret scanning is paid-only on private repos, so a **local gitleaks pre-commit hook** (Claude Code) is the "keys never in repo" backstop; plus `npm audit` + locked deps.
- **Light audit log + DB backups.**
- **Out of scope, deliberately:** WAF, DDoS services, pentest, SSO, secrets-vault, IDS/SIEM, SOC 2 — revisit only if the app becomes multi-tenant/client-facing.
