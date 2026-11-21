# Zimplixio Office — Operating Instructions

> ⚠️ **This repository is PUBLIC** (github.com/root-else-sudo/Zimplixio_Office). Everything committed is readable by anyone. Never commit client or prospect names, personal details about the owner, real credentials or defaults, or screenshots of real data. Keep that kind of material in the database, or in documents outside the repo.

## What This Is
The single platform for Zimplixio's operations: a Next.js CRM organized as a **company made of departments** (Product/Research, Engineering, Marketing, Sales, Finance, Operations). It's heading toward an autonomous, agent-run company that the owner supervises, and later a portal for Zimplixio's clients too.

V1 (Posts/LinkedIn, Projects/Gantt, Opportunities, a separate Python repo) was retired on 2026-07-06 and rebuilt from scratch as V2. Nothing was migrated. The README has the full public overview; `docs/GOTCHAS.md` has every past pitfall in detail.

## Status (as of 2026-11-20)

**Done:**
- **Original V2 build order (planning §7), all 5 increments:** generic Department + shared anatomy; Product/Research artifacts (Company Profile, Findings); Research Engine; Review UI; learning loop (Guidance Summary).
- **Hardening audit (July):** done, with 10 items deliberately deferred (see the README's "Known Gaps").
- **Research Probe POC (Workflow tab):** built. Code work has been paused since 2026-07-20.
- **Sign-in screens redesigned (2026-11-19/20):** the "lamp room" scene, animated 6-digit code, return-to-page, session-ended notice, show password and Caps Lock warning.
- **MFA bypasses closed (2026-11-19).** See Security below.
- **Dependencies (2026-11-18):** 32 npm advisories fixed and all stale Dependabot branches deleted. One advisory (`effect`, Prisma CLI only) is knowingly accepted (GOTCHAS #5).

- **Access Management step 1 (Foundation), 2026-11-20:** companies, staff vs client accounts, the deny-by-default wall (proxy + guards + `withAuth`), client portal shell, immediate session revocation via `sessionVersion`, mandatory MFA, interim admin CLI (`npm run access`), Vitest suite (`npm test`). Built and live-verified locally; spec at `docs/superpowers/specs/2026-11-20-access-management-design.md`. Revocation is enforced per request by a DB-backed session check in the proxy (resolved: layouts/templates alone miss in-group soft navigation).

- **Access Management step 2 (Administration + invite links), 2026-11-21:** `/admin` (Companies, Users, Activity log) for platform admins, one-time invite links (hashed single-use tokens, 72h TTL), public `/invite/[token]` accept flow with forced MFA enrollment, MFA reset, deactivate/reactivate users and companies, and an `AuditLog` table. Built and live-verified locally (12 checks); pending owner commit. The CLI is now a fallback.

**Next:** access-management step 3 (Twilio delivery of invites and password reset). MFA recovery codes are still a gap.

**Not built yet:** Engineering, Marketing, Sales, Finance and Operations are reserved seats (Department row + empty Goal/Task/Knowledge/Kpi tables). Building one repeats the Product/Research pattern below.

## Authoritative docs (all in the repo)
- **V2 specs:** `docs/superpowers/specs/`. The Planning doc (`2026-07-03-crm-v2-planning.md`) is the master; read it before starting a new department. Also the Design System (`2026-07-03-crm-v2-design-system.md`, which includes §6.1 Auth Screens), Environments & Git Workflow, and Security. Each has an "Implementation Status" block.
- **Charter (original six-department scope):** `docs/superpowers/specs/2026-07-02-crm-department-redesign-charter.md`.
- **Plans for past work:** `docs/superpowers/plans/`.
- **Ops references:** `docs/ENV.md`, `docs/RAILWAY.md`, `docs/SECURITY.md`, `docs/GOTCHAS.md`.

## Architecture (locked, planning §4.3 "Option A")
- **Generic structure:** one generic `Department` entity (`id, key, name, status, order`), plus shared-anatomy tables `Goal` / `Task` / `Knowledge` / `Kpi`, each referencing a department.
- **Department-specific artifacts** get their own tables keyed to the owning department. Product/Research has `CompanyProfile`, `GuidanceSummary` and `Finding`, and the Probe's tables.
- **Adding department #N** means one new row, plus optional extension tables. Existing departments are never touched.

**Department routes:**
- `src/app/(dashboard)/departments/[key]/page.tsx` serves `RESERVED` departments, and any `BUILT` department with no specific artifacts. Reserved ones show a `ReservedState` placeholder plus their seeded Knowledge/KPIs, read-only.
- A `BUILT` department with its own artifacts gets a **static route tree** that shadows the dynamic one. So far that's only `departments/product-research/`, with its own `layout.tsx` tab bar.
- Slug↔enum conversion lives in `src/lib/departments.ts`.

**Product/Research, concretely:**
- **Generic anatomy:** Goals, Tasks, Knowledge, KPIs.
- **Company Profile:** editable; grounds the agent's *fit*.
- **Guidance Summary:** editable; grounds the agent's *relevance*. It's auto-distilled from validate/reject decisions after each run.
- **Findings:** `candidate → validated/rejected`, through an inline Review UI. A written reason is required to reject.
- **Research Engine** (`src/lib/research/`):
  - Ground → Gather (Tavily) → Hypothesize → Test (Claude) → Queue (dedupe).
  - Runs weekly, Monday 08:00 UTC, on the Worker, or with a rate-limited **Run now** button.
  - Contract: if a stage's output fails validation, the run aborts rather than retrying.
- **Workflow tab: Research Probe** (below).

**Research Probe (POC), deliberately separate from the Research Engine:**
- **Own tables, zero shared schema with `Finding`:** `ProbeRun`, `ProbeSignalItem`, `ProbeHypothesis`, `ProbeReviewGuidance` (distilled cross-run noise patterns), and `ProbeDomainRule` (per-domain EXCLUDE / EXACT_MATCH search tuning that applies to every future run).
  - `ProbeHypothesis` has **no approval lifecycle**, only a `confidence` value. Don't extend rule 4 to it, or graduate it beyond a POC, without deciding that on purpose.
- **Fully synchronous, no pg-boss.** `POST /api/research-probe/run` awaits the whole pipeline (up to about 60s). This works because Railway runs a long-lived process. The **web** service calls Tavily and Anthropic directly.
- **Pipeline** (`src/lib/research-probe/`):
  1. **Gather** (`gather.ts`): targeted queries for one named company (jobs, careers, employee reviews), plus the owner's manual notes and URLs via `extract()`.
  2. **Deepen** (`deepen.ts`): re-fetches shallow `search()` hits as full pages. It runs **before** Review, so Review's edits aren't clobbered later.
  3. **Review** (`review.ts`, Haiku): drops same-name-different-company items and near-duplicates, and may strip clearly irrelevant blocks with `cleanedContent`. It never judges business relevance. Owner-supplied items (`MANUAL` / `TAVILY_EXTRACT`) are always kept.
  4. **Hypothesize** → **Test**.
- **Excluded noise is persisted but never shown in the UI.** This is the owner's explicit call: reading time is a real cost.
- **History:** `docs/superpowers/specs/2026-07-1[2-5]-research-probe-*` and the matching plans.

## Auth & Security (current model — details in `docs/SECURITY.md`)
- **Sign-in:** NextAuth v5 credentials with JWT sessions, plus Twilio Verify TOTP MFA. Enforced by `src/proxy.ts` for pages and `withAuth()` in `src/lib/rbac.ts` for APIs.
- **Session refreshes never trust the browser:**
  - On `useSession().update()`, `src/lib/auth.ts` re-reads `mfaEnabled` from the database.
  - It sets `mfaVerified: true` only for a valid **server-signed proof** (`src/lib/mfa-proof.ts`): an HMAC bound to the user and that login's `sid`, 2-minute expiry.
  - `/api/mfa/verify` and `/api/mfa/setup` issue the proof only after Twilio approves a code.
  - `/api/mfa/setup` refuses (403) to re-enroll when MFA is already on and the session isn't verified.
- **`src/lib/auth.config.ts` must stay edge-safe** (the proxy uses it): no Prisma, no Node crypto. Server-only checks go in `auth.ts`.
- **Return-to-page and session-ended rules** live in `src/lib/auth-redirect.ts`:
  - `safeCallbackUrl()` blocks open redirects.
  - The `zx_signed_in` marker cookie powers the "your session ended" notice.
  - Always sign out with `signOutDeliberately()` (`src/lib/sign-out.ts`).
- **Rate limits:** login 5 attempts per 15 minutes per email; MFA verify 5 per 15 minutes per user; Research Run-now 1 per 5 minutes; Probe 1 per 2 minutes.
- **MFA enrollment for the real admin account:** the owner has used the MFA flow on the dev site (2026-11-20). Still confirm `mfaEnabled` in the database before assuming it for any specific account.

## Design System & Styling
- **Tokens:** navy, forest-green and copper tokens in `src/app/globals.css` `:root`, mapped to Tailwind classes in `@theme inline` (`bg-navy-900`, `text-copper-500`, `border-line`…).
  - Brand greens are `forest-*`, so Tailwind's own `green-*` is never overridden.
  - No indigo anywhere.
- **Spec:** `docs/superpowers/specs/2026-07-03-crm-v2-design-system.md`. Motion is "calm and fast" everywhere except the auth screens (§6.1), which deliberately use rich motion.
- **Auth screens:**
  - Shared scene in `src/app/(auth)/layout.tsx` → `AuthScene`.
  - Components in `src/components/auth/`.
  - All visuals and animations in `src/styles/auth.css`.
  - The copper `.btn-accent` is primary there; green `.btn-primary` stays primary inside the app.
- **The older dashboard pages still use inline styles** (roughly 90 `style={{}}` uses across about 17 files). Migrating them to the token classes is a known cleanup pass. Do it only when asked, not silently inside unrelated work.

## Tech Stack
- **Framework:** Next.js 16 App Router (server + client components). `next dev` regenerates `AGENTS.md`; commit it.
- **Language:** TypeScript (strict).
- **Database:** PostgreSQL via Prisma 7 with the driver adapter (`@prisma/adapter-pg`, `src/lib/prisma.ts`).
  - The datasource URL comes from `prisma.config.ts`, which reads `process.env.DATABASE_URL` directly.
  - Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the same version.
- **Job queue:** pg-boss. There's one job, `research.run` (`src/lib/pgboss.ts`, handler in `worker/src/handlers/research.ts`), with `policy: 'singleton'`. Run-now also checks `getQueueSize(..., { before: 'completed' })` (GOTCHAS #7).
- **AI:** `src/lib/ai-client.ts` wraps Claude: PRIMARY Sonnet, FAST Haiku, HEAVY Opus. It tracks cost per call.
- **Styles:** Tailwind CSS v4, token-based (see above).
- **Charts:** Recharts, installed but currently unused.
- **Deployment:** Railway, two services (`Zimplixio_Office` web + `Worker`) sharing one Postgres.
- **Secrets hygiene:** gitleaks pre-commit hook (`.husky/pre-commit`, rules in `.gitleaks.toml`, including custom Anthropic/Tavily/Twilio key patterns).

## Architecture Pattern
Server components fetch data from Prisma and pass it as serialized props to `*Client.tsx` client components. Never call Prisma from client components. API routes handle all mutations and job enqueues. The auth pages follow this too: a server `page.tsx` (metadata, validated search params) renders `*Client.tsx`.

```
page.tsx (server)  →  props  →  PageClient.tsx (client)
                                      ↕ fetch
                              /api/[route]/route.ts
                                      ↕
                                    Prisma
```

**Tab titles:** the root layout sets `title.template = '%s · Zimplixio Office'`. A page sets only `export const metadata = { title: '…' }`.

## Key Development Notes

**Node:** the nvm Node 20 binary is native **arm64** now. If `node` isn't on PATH in Claude Code's shell, prefix commands like this:
```bash
PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit
```
Don't use `arch -x86_64`; it fails with "Bad CPU type".

**Local testing:**
- Run `next dev` on the port in `NEXTAUTH_URL` (3000).
- Load `.env` with `npx tsx --env-file=.env`, not shell `source`.
- Use a throwaway local test user, and delete it afterwards.
- Repeated logins trip the 5/15-minute rate limit; clear that user's `RateLimit` rows in the **local** database.
- Headless Playwright is available (Python, cached Chromium) for live UI checks when the Chrome extension isn't connected.
- More detail in GOTCHAS #22–27.

## Rules
1. **Always run the TypeScript check after changes** (`tsc --noEmit`) before declaring done. Run lint on touched files too.
2. **Server components fetch data; client components own UI state.** Never blur this boundary.
3. **The Prisma schema is the single source of truth.** Run `prisma migrate dev` after any model change.
4. **Nothing goes live without explicit human action.** Findings only ever reach `VALIDATED`/`REJECTED` when the owner clicks Validate/Reject (`src/components/departments/CandidateFindingRow.tsx`); the Research Engine can only write `status: 'CANDIDATE'`. Preserve this in every future department's agent work.
5. **Styling comes from the shared system, never per page:** tokens + `@theme` classes, shared components, and stylesheets (`src/styles/*.css`) whose visuals are driven by `data-*` state. There's no inline `style={{}}` and no hex in TSX. The only exception is per-instance random data, passed as CSS custom properties. When you add a pattern, document it in the design spec. (GOTCHAS #16–19)
6. **The repo is public.** See the warning at the top. Check new docs, specs, seed data and code comments for client, prospect or personal details before committing.
7. **Lazy SDK clients:** never construct Anthropic, Twilio, Tavily or other clients at module level. (GOTCHAS #1)
8. **`export const dynamic = 'force-dynamic'`** on any page, layout or route that calls `auth()` or Prisma. (GOTCHAS #2)
9. **After any dependency change, verify with `rm -rf node_modules && npm ci && npm run build`.** Never run `npm audit fix --force` reflexively, and never accept a major downgrade as a "fix". (GOTCHAS #4–5)
10. **Anthropic tool schemas:** use Zod v4's `z.toJSONSchema()` (`src/lib/ai/json-schema.ts`). Log the output once before trusting it. (GOTCHAS #8)
11. **Leave headroom on Claude structured-output length limits.** (GOTCHAS #9)
12. **Shared `railway.toml` changes must be verified on every service separately.** Dashboard settings don't override config-as-code. (GOTCHAS #6)
13. **Tavily `search()` timeouts are in ms; `extract()` timeouts are in seconds.** Test new `extract()` calls against a real URL. (GOTCHAS #10)
14. **Never trust `useSession().update()` payloads.** Any new session field gets server-side verification in `src/lib/auth.ts`. Any `skipMfaCheck` route needs its own password-only-session guard. (GOTCHAS #12–13)
15. **Validate every return-to URL** with `safeCallbackUrl()`. (GOTCHAS #15)
16. **`withAuth` defaults to staff-only.** A client calling a staff API gets 404. Only opt in to `audience: 'any'` (or a stricter option) deliberately, and never wrap a route in anything weaker. `test/api-coverage.test.ts` enforces that every route is wrapped. (SECURITY.md)
17. **Revocation is enforced in the proxy, with guards as defense in depth.** `src/proxy.ts` runs a DB-backed session check (`isSessionStillActive`, `src/lib/proxy-session.ts`) on every logged-in page request except `/login`, before MFA/enrollment/kind redirects; failure or DB error goes to `/api/session/end`. Also keep `requireStaff`/`requireClient`/`requireSignedIn` in BOTH `layout.tsx` and `template.tsx` of every route group. A layout-only guard is not a revocation boundary: layouts and templates don't re-run for in-group soft navigation. Test revocation with a real click, not `page.goto`. (GOTCHAS #28, #29)
18. **`tenantDb` (`src/lib/tenancy.ts`) is the only path to tenant-owned data.** No raw Prisma queries on client-owned models; add each new model to `TENANT_OWNED_MODELS`.
19. **`npm test` (Vitest) must pass before declaring done.** Tests run against a separate `_test` database (`DATABASE_URL_TEST`); the guard refuses anything else. (GOTCHAS #30)
20. **Admin mutations go only through `src/lib/admin/*`, with the `AuditLog` row written in the same transaction as the change.** Never update users, companies or invites from a route or page directly. Every admin page calls `requirePlatformAdmin()` first (the admin `layout.tsx` and `template.tsx` do too), and every `/api/admin/**` route uses `withAuth(..., { platformAdmin: true })`. Audit metadata never holds passwords, tokens, token hashes or MFA secrets. Invite tokens are stored only as `sha256` hashes. (SECURITY.md)

## Key Environment Variables
Full reference in `docs/ENV.md`. The variables that affect code behavior:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Auth base URL and signing secret (the secret also derives the MFA-proof key) |
| `AUTH_TRUST_HOST` | `1` in production, required behind the Cloudflare proxy |
| `ANTHROPIC_API_KEY` | Claude: Research Engine (Worker) and Research Probe (web) |
| `TAVILY_API_KEY` | Tavily: required on **both** Railway services (validated at boot on both; the Probe calls it from web) |
| `TWILIO_*` | Twilio Verify TOTP MFA |
| `SEED_EMAIL` / `SEED_PASSWORD` | Used by `npm run seed`; always set both |

> **Legacy:** `PIPELINE_USE_QUEUE` and `MARKETING_DIR` are still declared optional in `src/lib/env.ts` but unused. Remove them from Railway whenever convenient. The npm scripts `backfill:post-versions`, `trigger:stale-check` and `test:whatsapp` are V1 leftovers; the first two point at files that no longer exist.

## Git / Environments
- Work happens on `development` only. `main` is production and stays untouched until the owner explicitly asks for a release.
- Railway's `development` environment auto-deploys this branch and serves `crm.zimplixio.com`. A `production` Railway environment is designed but not yet provisioned.
- **The owner makes all commits and pushes.** Leave changes in the working tree, and give literal commands (using `-m` so Vim doesn't open).
