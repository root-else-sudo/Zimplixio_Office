# Zimplixio Office — Operating Instructions

## What This Is
The single consolidated platform for Zimplixio's operations — a Next.js CRM organized as a **company made of departments** (Product/Research, Engineering, Marketing, Sales, Finance, Operations), heading toward an autonomous, agent-run company the owner supervises. See the CRM v2 section below for current status; V1's feature list (Posts/LinkedIn, Projects/Gantt, Opportunities) has been fully retired and rebuilt fresh under this department structure, one department at a time.

A companion Python repo (`Zimplixio_Marketing`) existed pre-V2 and has been archived on GitHub (2026-06-30) — nothing from it was migrated; this repo is the sole platform going forward.

## CRM v2 — Department-Organized Rebuild (as of 2026-07-08)

**Status: scope and architecture are both locked; Increment 1 is complete and live.** The CRM is being reframed from a *feature-organized* app into a **company organized by departments**, heading toward an autonomous, agent-run company the owner supervises. Build order: **structure first → agents plug in → autonomy grows.**

**This is a clean rebuild (V2), not a migration.** On 2026-07-06, all V1 tables were dropped from both the local dev DB and the Railway `development` Postgres, and all V1 feature code (Posts, Projects, Opportunities, Notifications/Web Push, the legacy pipeline/opportunities/linkedin/cron worker job handlers) was deleted outright. Nothing was migrated forward — every schema decision is re-derived from the v2 planning doc. Stack tooling (Next.js, Prisma, pg-boss, NextAuth, Tailwind) is kept as-is.

**Charter (original scope, still accurate for the six-department roster):** `docs/superpowers/specs/2026-07-02-crm-department-redesign-charter.md`.

**V2 planning docs (authoritative, supersede the charter's architecture guess) — NOT committed to this repo, owner's machine only:**
`~/Documents/Zimplixio Documents/CRM Version 2/` — four docs: Planning (function/architecture/build order — the master doc), Design System (navy/forest-green/copper tokens), Environments & Git Workflow, Security. Read the Planning doc before any further redesign work. Consider copying these into `docs/` at some point so they're version-controlled and durable across machines.

**Architecture (locked, planning doc §4.3 "Option A"):** one generic `Department` entity (`id, key, name, status, order`) + shared-anatomy tables `Goal` / `Task` / `Knowledge` / `Kpi`, each referencing a department. Department-specific artifacts (Company Profile, Findings — not built yet) get their own tables keyed to the owning department. Adding department #N = one new row + optional new extension tables — existing departments are never touched. This superseded the charter's tentative "Approach B" (per-department service-layer modules under `src/modules/<department>/`) once the owner returned with the full planning doc.

**Build order (planning doc §7):**
| # | Increment | Status |
|---|---|---|
| 1 | Generic Department + shared anatomy; seed all six departments | ✅ Done — live on `crm.zimplixio.com` |
| 2 | Product/Research artifacts: Company Profile + Findings | ⏳ Next up |
| 3 | Research Engine job (Ground→Gather→Hypothesize→Test→Queue→Review→Learn), scheduled + Run-now | Not started |
| 4 | Review UI: approve/reject with written reason | Not started |
| 5 | Learning loop: distill + re-feed the Guidance Summary | Not started |

**Department routes:** single dynamic route `src/app/(dashboard)/departments/[key]/page.tsx` — `RESERVED` departments render a `ReservedState` placeholder; `BUILT` departments (Product/Research only so far) render the anatomy view. Slug↔enum conversion lives in `src/lib/departments.ts`.

**Git / environments:** work happens on `development` only — `main` is production and stays untouched until the owner explicitly instructs a release. Railway's `development` environment (auto-deploy on) tracks this branch and is live; a `production` Railway environment is designed but not yet provisioned. See `docs/RAILWAY.md` and the Environments & Git Workflow doc above.

## Production Status (as of 2026-07-08)

- **Web:** `https://crm.zimplixio.com` (Cloudflare → Railway, SSL Full) — running v2
- **Worker:** Railway `Worker` service — pg-boss plumbing kept, but **no job handlers are currently registered** (the legacy Python-pipeline handlers were deleted; the Research Engine job will be added here in Increment 3)
- **Gmail OAuth / R2:** the Gmail-fetch + R2 market-context-cache pipeline that used these is gone with the rest of V1. The Google Cloud Console app and `zimplixio-marketing` R2 bucket likely still exist but are unused — not yet cleaned up.

## Tech Stack
- **Framework**: Next.js App Router (server + client components)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Job queue**: pg-boss — plumbing kept, but no jobs registered right now (V1's handlers deleted; Research Engine job lands in Increment 3)
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
4. **Nothing goes live without explicit human action** — the human-in-the-loop gate applies to Findings review (Increment 4+) the same way it applied to post approval in V1
5. **Use lazy initialization for SDK clients** — never call `new Anthropic()`, `twilio()`, or `webpush.setVapidDetails()` at module level. `next build` runs module-level code without env vars injected, causing crashes. Wrap in a lazy getter called at request time.
6. **CRM v2 rebuild in progress** — scope and architecture are both locked (see the CRM v2 section above); build one increment at a time per the planning doc's build order, and don't build ahead of the current increment without the owner's go-ahead.
7. **Auth-gated / DB-backed pages must force dynamic rendering** — add `export const dynamic = 'force-dynamic'` to any page/layout that calls `auth()` or queries Prisma. `src/lib/env.ts` deliberately returns an empty env object during `next build` (so the build doesn't need real secrets), which means any page Next.js tries to statically prerender at build time will crash if it touches the DB. This bit us once already (`src/app/(dashboard)/page.tsx` + `layout.tsx`).
8. **Before trusting any dependency/security fix, verify with a clean `rm -rf node_modules && npm ci && npm run build`** — not just `tsc --noEmit` or `next dev`. `npm audit fix --force` can silently rewrite unrelated package versions (it once downgraded the `prisma` CLI to a major version incompatible with `@prisma/client`, which only broke on a clean install/build — `next dev` and a stale local Prisma client masked it completely). Also: don't re-run `--force` reflexively if a later advisory suggests "fixing" something by reverting a version you just fixed — check what it's actually proposing first.

## Key Environment Variables

See `docs/ENV.md` for the full reference. Vars that affect code behavior:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_TRUST_HOST` | Set to `1` in production — required behind Cloudflare proxy |
| `ANTHROPIC_API_KEY` | Claude API — used by the Company Profile / Research Agent work (Increment 2+) |
| `TAVILY_API_KEY` | Tavily search API — used by the Research Engine (Increment 3, not built yet) |

> **Legacy vars (V1/Python-pipeline era):** `PIPELINE_USE_QUEUE`, `MARKETING_DIR` — the code paths that used them are deleted; `src/lib/env.ts` still declares them as optional so nothing crashes if they're still set in Railway, but they're dead weight and can be removed from Railway env whenever convenient.
