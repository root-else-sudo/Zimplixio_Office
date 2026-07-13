# Zimplixio Office — Operating Instructions

## What This Is
The single consolidated platform for Zimplixio's operations — a Next.js CRM organized as a **company made of departments** (Product/Research, Engineering, Marketing, Sales, Finance, Operations), heading toward an autonomous, agent-run company the owner supervises. See the CRM v2 section below for current status; V1's feature list (Posts/LinkedIn, Projects/Gantt, Opportunities) has been fully retired and rebuilt fresh under this department structure, one department at a time.

A companion Python repo (`Zimplixio_Marketing`) existed pre-V2 and has been archived on GitHub (2026-06-30) — nothing from it was migrated; this repo is the sole platform going forward.

## CRM v2 — Department-Organized Rebuild (as of 2026-07-09)

**Status: the full original build order (planning §7) is complete and live.** Product/Research is now the fully-built reference department — the pattern every future department follows. The CRM is reframed from a *feature-organized* app into a **company organized by departments**, heading toward an autonomous, agent-run company the owner supervises.

**This is a clean rebuild (V2), not a migration.** On 2026-07-06, all V1 tables were dropped from both the local dev DB and the Railway `development` Postgres, and all V1 feature code (Posts, Projects, Opportunities, Notifications/Web Push, the legacy pipeline/opportunities/linkedin/cron worker job handlers) was deleted outright. Nothing was migrated forward — every schema decision is re-derived from the v2 planning doc. Stack tooling (Next.js, Prisma, pg-boss, NextAuth, Tailwind) is kept as-is.

**Charter (original scope, still accurate for the six-department roster):** `docs/superpowers/specs/2026-07-02-crm-department-redesign-charter.md`.

**V2 planning docs (authoritative, supersede the charter's architecture guess) — NOT committed to this repo, owner's machine only:**
`~/Documents/Zimplixio Documents/CRM Version 2/` — four docs: Planning (function/architecture/build order — the master doc), Design System (navy/forest-green/copper tokens), Environments & Git Workflow, Security. Read the Planning doc before starting a new department. Consider copying these into `docs/` at some point so they're version-controlled and durable across machines.

**Architecture (locked, planning doc §4.3 "Option A"):** one generic `Department` entity (`id, key, name, status, order`) + shared-anatomy tables `Goal` / `Task` / `Knowledge` / `Kpi`, each referencing a department. Department-specific artifacts (Company Profile, Findings, GuidanceSummary) get their own tables keyed to the owning department. Adding department #N = one new row + optional new extension tables — existing departments are never touched. This superseded the charter's tentative "Approach B" (per-department service-layer modules under `src/modules/<department>/`) once the owner returned with the full planning doc.

**Build order (planning doc §7) — all done:**
| # | Increment | Status |
|---|---|---|
| 1 | Generic Department + shared anatomy; seed all six departments | ✅ Done (2026-07-06) |
| 2 | Product/Research artifacts: Company Profile + Findings | ✅ Done (2026-07-08) |
| 3 | Research Engine job (Ground→Gather→Hypothesize→Test→Queue), scheduled + Run-now | ✅ Done (2026-07-08) |
| 4 | Review UI: inline approve/reject with written reason | ✅ Done (2026-07-08) |
| 5 | Learning loop: distill + re-feed the Guidance Summary | ✅ Done (2026-07-09) |

**What Product/Research now has, concretely:** Goals/Tasks/Knowledge/KPIs (generic anatomy) + a Company Profile (editable, grounds agent *fit*) + a Guidance Summary (editable, grounds agent *relevance*, auto-distilled from validate/reject decisions each run) + Findings with a full `candidate → validated/rejected` lifecycle (inline Review UI, written reason required to reject) + a working Research Engine (`src/lib/research/`) that runs weekly (Monday 08:00 UTC) or on-demand via a rate-limited "Run now" button, gathering signal from Tavily, reasoning in two passes (Hypothesize then Test) via Claude, and writing deduplicated candidate Findings.

**Next department to build:** none started. Engineering/Marketing/Sales/Finance/Operations are still reserved seats (structure only — Department row + empty Goal/Task/Knowledge/Kpi tables). Building one out means repeating this exact pattern: read the planning doc, decide what (if any) department-specific artifacts it needs beyond the generic anatomy, and follow the file/route conventions below.

**Department routes:** the generic dynamic route `src/app/(dashboard)/departments/[key]/page.tsx` serves `RESERVED` departments (a `ReservedState` placeholder) and any `BUILT` department with no specific artifacts yet. A `BUILT` department with its own artifacts (so far, only Product/Research) gets a **static route tree** that shadows the dynamic one — `src/app/(dashboard)/departments/product-research/` with its own `layout.tsx` (tab bar) — Next.js resolves the static segment first, so this never touches the generic route or other departments. Slug↔enum conversion lives in `src/lib/departments.ts`.

**Git / environments:** work happens on `development` only — `main` is production and stays untouched until the owner explicitly instructs a release. Railway's `development` environment (auto-deploy on) tracks this branch and is live; a `production` Railway environment is designed but not yet provisioned. See `docs/RAILWAY.md` and the Environments & Git Workflow doc above.

## Production Status (as of 2026-07-09)

- **Web:** `https://crm.zimplixio.com` (Cloudflare → Railway, SSL Full) — running v2
- **Worker:** Railway `Worker` service — runs the `research.run` pg-boss job (singleton queue policy: at most one active run at a time; weekly cron + on-demand). First job registered since the legacy Python-pipeline handlers were deleted.
- **Gmail OAuth / R2:** the Gmail-fetch + R2 market-context-cache pipeline that used these is gone with the rest of V1. The Google Cloud Console app and `zimplixio-marketing` R2 bucket likely still exist but are unused — not yet cleaned up.

## Tech Stack
- **Framework**: Next.js App Router (server + client components)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Job queue**: pg-boss — one job registered, `research.run` (`src/lib/pgboss.ts`, handler in `worker/src/handlers/research.ts`), `policy: 'singleton'` so at most one run is ever active at once. Note: pg-boss's singleton policy only blocks a second *active* job, not a second *queued* one (its unique index is scoped to `state='active'`) — the Run-now route additionally checks `getQueueSize(..., { before: 'completed' })` before enqueueing, since that's the real "already in progress" guard.
- **Auth**: NextAuth v5 (credentials + Twilio Verify TOTP MFA, kept from V1)
- **Styles**: Tailwind CSS + Soft UI design system in `src/app/globals.css` — retheme'd to navy/forest-green/copper tokens as of the v2 rebuild (see Design System doc above); no indigo
- **Charts**: Recharts (currently unused post-rebuild; was V1's dashboard chart library)
- **Deployment**: Railway — two services (`Zimplixio_Office` web + `Worker`) sharing one Postgres addon. Web Push/VAPID notifications were V1-only and removed with the rest of V1 — not currently part of v2's scope
- **Secrets hygiene**: gitleaks pre-commit hook via husky (`.husky/pre-commit`, rules in `.gitleaks.toml` — includes custom Anthropic/Tavily/Twilio key patterns since gitleaks' default rules miss hyphenated key formats)

## Architecture Pattern
Server components fetch data from Prisma and pass it as serialized props to `*Client.tsx` client components. Never call Prisma directly from client components. API routes handle all mutations and job enqueues (pg-boss). The pattern is:

```
page.tsx (server)  →  props  →  PageClient.tsx (client)
                                      ↕ fetch
                              /api/[route]/route.ts
                                      ↕
                                    Prisma
```

## Key Development Notes

### Running on Apple Silicon (M-series Mac)
The project uses an x86_64 Node binary via nvm. If `node` is not found in PATH in Claude Code's shell context, prefix commands:
```bash
PATH="/Users/josephugaldeberrocal/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit
```
Normal terminal usage with nvm loaded works fine.

### TypeScript checks
```bash
PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"
```
The `validator.ts` warning is a stale `.next/types` artifact — safe to ignore, clears on next full build.


## Rules
1. **Always run TypeScript check after changes** — `tsc --noEmit` before declaring done
2. **Server components fetch data; client components own UI state** — never blur this boundary
3. **Prisma schema is the single source of truth** — run `prisma migrate dev` after any model change
4. **Nothing goes live without explicit human action** — Findings only ever reach `VALIDATED`/`REJECTED` via an owner clicking Validate/Reject (`src/components/departments/CandidateFindingRow.tsx`); the Research Engine can only ever write `status: 'CANDIDATE'`. Preserve this invariant in every future department's agent work.
5. **Use lazy initialization for SDK clients** — never call `new Anthropic()`, `twilio()`, or a Tavily/other client constructor at module level. `next build` runs module-level code without env vars injected, causing crashes. Wrap in a lazy getter called at request time (see `getAnthropic()` in `src/lib/ai-client.ts`, `getTavily()` in `src/lib/research/tavily.ts`).
6. **CRM v2 rebuild in progress** — scope and architecture are both locked (see the CRM v2 section above); the original build order (planning §7) is complete. Building the next department follows the same pattern (generic anatomy first, specific artifacts only if the planning doc calls for them) — don't build a department's specific artifacts ahead of what's actually been asked for.
7. **Auth-gated / DB-backed pages must force dynamic rendering** — add `export const dynamic = 'force-dynamic'` to any page/layout/API route that calls `auth()` or queries Prisma. `src/lib/env.ts` deliberately returns an empty env object during `next build` (so the build doesn't need real secrets), which means any page Next.js tries to statically prerender at build time will crash if it touches the DB. This bit us once already (`src/app/(dashboard)/page.tsx` + `layout.tsx`).
8. **Before trusting any dependency/security fix, verify with a clean `rm -rf node_modules && npm ci && npm run build`** — not just `tsc --noEmit` or `next dev`. `npm audit fix --force` can silently rewrite unrelated package versions (it once downgraded the `prisma` CLI to a major version incompatible with `@prisma/client`, which only broke on a clean install/build — `next dev` and a stale local Prisma client masked it completely). Also: don't re-run `--force` reflexively if a later advisory suggests "fixing" something by reverting a version you just fixed — check what it's actually proposing first.
9. **For Zod→Anthropic tool schemas, use Zod v4's native `z.toJSONSchema()`** (`src/lib/ai/json-schema.ts`), not the third-party `zod-to-json-schema` package — its v3.x line reads Zod's internal `_def` structure directly, which changed shape in Zod v4, and it silently returns `{}` (no error) rather than failing loudly. This produced a real 400 from Anthropic ("input_schema.type: Field required") that only showed up on an actual API call, not in `tsc` or local schema construction — always sanity-check a new Anthropic tool schema's actual JSON output (`console.log(TOOL.input_schema)`) before trusting it end-to-end.
10. **Any Claude-structured-output field with a length limit needs headroom** — Claude will write longer/more natural phrasing than a tight `.max()` suggests. Give schema limits meaningful slack over the "target" length mentioned in the field's `.describe()` text (e.g. target 200 chars, hard cap 300), or a validation failure silently aborts that pipeline stage (by design — see the Research Engine's abort-not-retry contract in `src/lib/research/engine.ts` — but still wastes the run if the limit is just wrong).
11. **A shared root-level Railway config change (`railway.toml`) must be verified against *every* service independently, never assumed to apply identically.** Adding `[deploy] preDeployCommand = ["npx prisma migrate deploy"]` to fix manual migrations worked fine for `Zimplixio_Office` (Railpack build) but broke `Worker` (Dockerfile build) outright — its pre-deploy step couldn't see `DATABASE_URL` even though it's correctly set on that service's own Variables tab, a Railway platform limitation specific to that service's execution context, not a code bug. A per-service dashboard override was tried as a fix and silently didn't take effect (config-as-code kept winning over the dashboard setting) — don't assume dashboard settings override `railway.toml`. The actual fix: remove the setting from `railway.toml` entirely and set it directly on the one service's own dashboard instead (see `docs/RAILWAY.md`'s "Database migration" section).

## Key Environment Variables

See `docs/ENV.md` for the full reference. Vars that affect code behavior:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_TRUST_HOST` | Set to `1` in production — required behind Cloudflare proxy |
| `ANTHROPIC_API_KEY` | Claude API — used by the Research Engine's Hypothesize/Test/Distill calls (`src/lib/ai-client.ts`) |
| `TAVILY_API_KEY` | Tavily search API — used by the Research Engine's Gather step (`src/lib/research/tavily.ts`). Required on **both** Railway services (env validated at boot on both, even though only the Worker calls Tavily) |

> **Legacy vars (V1/Python-pipeline era):** `PIPELINE_USE_QUEUE`, `MARKETING_DIR` — the code paths that used them are deleted; `src/lib/env.ts` still declares them as optional so nothing crashes if they're still set in Railway, but they're dead weight and can be removed from Railway env whenever convenient.
