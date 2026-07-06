# Zimplixio Office — Operating Instructions

## What This Is
The single consolidated platform for Zimplixio's operations. A Next.js CRM that will cover:
- SMB market research and pain point intelligence
- LinkedIn content generation, review, and approval
- Business opportunity surfacing and tracking
- Project and task management (Gantt)
- Pipeline run history and agent status

## Architectural Direction (as of 2026-06-30)

**The CRM is the sole platform going forward.** The companion Python repo (`Zimplixio_Marketing`) has been archived on GitHub — it served its purpose as a starting point but is no longer being developed. All future features are built in TypeScript inside this repo.

Key decisions made:
- Python repo archived — nothing migrated, everything rebuilt from scratch with proper foundations
- All AI calls (Tavily, Anthropic) move to TypeScript using their respective JS SDKs
- PostgreSQL is the single source of truth — no more R2 JSON state files running in parallel
- A full architectural redesign is in progress before new features are built

## CRM Department Redesign (as of 2026-07-03)

**The redesign now has a defined direction and an approved scope.** The CRM is being reframed from a *feature-organized* app into a **company organized by departments**, with the long-term goal of an autonomous, agent-run company that the owner supervises. Build order: **structure first → agents plug in → autonomy grows.**

**Charter (scope locked):** `docs/superpowers/specs/2026-07-02-crm-department-redesign-charter.md` — read this before doing any redesign work. Summary:
- **Six departments** (all reserved as structure up front, built one at a time): **Product/Research, Engineering, Marketing, Sales, Finance, Operations.** Marketing↔Sales separate but linked by a lead handoff. People/HR + Legal fold into Operations for now. Operations = the owner's supervisor seat.
- **Shared department anatomy:** v1 = **Goals + Tasks**, designed to extend to **+ Knowledge + Metrics** soon.
- **First slice = Product/Research, built in full including a working agent:** Goals + Tasks + a first-class **Findings** artifact (`candidate → validated/approved → rejected`); a **Company Profile** (editable, capabilities-based source of truth grounding the agent); and a **Research Agent** using **Tavily + Claude** over tiered SMB sources, running **scheduled (pg-boss) + Run-now**, producing candidate Findings the owner reviews. A **prose-summary feedback loop** feeds owner decisions back into each run so it improves.

**Current phase / where we are:**
- Scope is **approved** (charter M0 complete). Owner is reviewing the charter file.
- **Next up: architecture / design pattern.** Three approaches were drafted; **selection pending.** Recommended = **Approach B**: per-department modules under `src/modules/<department>/` with a thin service layer (the only place that touches Prisma), API routes + pg-boss jobs as thin adapters, agent logic living with its department; keep REST + existing conventions. (A = evolve in place, no service layer; C = B + tRPC.)
- Owner is planning detailed work instructions in Claude.ai and will return with them before implementation begins. **No implementation has started.**

## Production Status (as of 2026-06-30)

- **Web:** `https://crm.zimplixio.com` (Cloudflare → Railway, SSL Full)
- **Worker:** Railway `Worker` service — currently still runs the legacy Python pipeline via pg-boss; will be repurposed as part of the redesign
- **Gmail OAuth:** app published to Production in Google Cloud Console (no 7-day token expiry)
- **R2:** bucket `zimplixio-marketing` in Cloudflare — legacy, used for Python pipeline state caching

## Tech Stack
- **Framework**: Next.js App Router (server + client components)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Job queue**: pg-boss (pipeline, LinkedIn publish, opportunities, stale-draft cron)
- **Auth**: NextAuth v5 (credentials + TOTP MFA)
- **Styles**: Tailwind CSS + custom Soft UI design system in `src/app/globals.css`
- **Charts**: Recharts
- **Notifications**: Twilio SMS (optional — `TWILIO_SMS_FROM`/`SMS_NOTIFY_TO` not yet configured) + Web Push (VAPID)
- **Deployment**: Railway — two services (`Zimplixio_Office` web + `Worker`) sharing one Postgres addon

## Architecture Pattern
Server components fetch data from Prisma and pass it as serialized props to `*Client.tsx` client components. Never call Prisma directly from client components. API routes handle all mutations and pipeline triggers. The pattern is:

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
4. **No posts go live without explicit user action** — the dashboard shows drafts; the user approves
5. **Use lazy initialization for SDK clients** — never call `new Anthropic()`, `twilio()`, or `webpush.setVapidDetails()` at module level. `next build` runs module-level code without env vars injected, causing crashes. Wrap in a lazy getter called at request time.
6. **Department redesign in progress** — scope is locked (see `docs/superpowers/specs/2026-07-02-crm-department-redesign-charter.md`), but the architecture pattern is not yet chosen and no implementation has started. Do not add features or write redesign code before the owner returns with approved work instructions. New work waits for the design-pattern decision + plan.

## Key Environment Variables

See `docs/ENV.md` for the full reference. Vars that affect code behavior:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_TRUST_HOST` | Set to `1` in production — required behind Cloudflare proxy |
| `ANTHROPIC_API_KEY` | Claude API — used for content generation and research |
| `TAVILY_API_KEY` | Tavily search API — used for market research |

> **Legacy vars (Python pipeline era, being phased out):** `PIPELINE_USE_QUEUE`, `MARKETING_DIR` — still present in Railway env but will be removed as part of the redesign.
