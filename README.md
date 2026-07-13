# Zimplixio Office

The single consolidated platform for Zimplixio's operations — a Next.js CRM organized as a **company made of departments** (Product/Research, Engineering, Marketing, Sales, Finance, Operations), heading toward an autonomous, agent-run company the owner supervises.

**Live:** `https://crm.zimplixio.com`

This is a from-scratch v2 rebuild. A prior, feature-organized version of this app (Posts/LinkedIn, Projects/Gantt, Opportunities, backed by a separate Python pipeline repo) has been fully retired — nothing from it was migrated. See `CLAUDE.md` for the full current status and build order.

## What it does

The sidebar is the org chart: six departments, each sharing the same base anatomy (**Goals + Tasks + Knowledge + KPIs**). Only **Product/Research** is built out so far; the other five are reserved seats (visible, clickable, not yet developed).

Product/Research additionally has:
- **Company Profile** — an editable, freeform-prose source of truth describing what Zimplixio can credibly offer as a service. This is the Research Engine's fit lens.
- **Guidance Summary** — a plain-English distillation of what past validate/reject decisions have taught the engine to look for or avoid, auto-distilled after each review round and re-fed into the next run.
- **Findings** — candidate service opportunities with a `candidate → validated/rejected` lifecycle. The Research Engine (Tavily + Claude) surfaces these automatically on a weekly schedule or on demand; the owner reviews and validates/rejects by hand — nothing goes live without that explicit action.
- **Workflow (Research Probe)** — a separate, experimental proof-of-concept: investigate one named company at a time (targeted Tavily search/extract plus your own manual notes/links), and see every step it takes — every signal item gathered, every hypothesis proposed, survivors and rejects alike — not just a final answer. Fully isolated from the Research Engine above (its own tables, no shared pipeline code, no job queue).

Auth includes Twilio Verify TOTP MFA, enforced at both the page and API layer — enroll or disable it from `/settings`.

## Architecture

Single Next.js app + one Postgres database (via Prisma) + a Worker service for background jobs (pg-boss). No second repo, no other language — the Research Engine is plain TypeScript modules the Worker calls directly.

**The keystone data model:** one generic `Department` entity + shared-anatomy tables (`Goal`, `Task`, `Knowledge`, `Kpi`), each referencing a department. Department-specific artifacts (Product/Research's `CompanyProfile`/`GuidanceSummary`/`Finding`, and the separate Research Probe's `ProbeRun`/`ProbeSignalItem`/`ProbeHypothesis`) get their own tables keyed to the department that owns them. Adding a new department is filling in a shape, never rebuilding one.

### Page pattern

```
page.tsx (server)  →  props  →  *Client.tsx (client)
                                       ↕ fetch
                               /api/[route]/route.ts
                                       ↕
                                     Prisma
```

Server components fetch from Prisma and pass serialized data to client components. Client components own UI state and call API routes for mutations. Never call Prisma from a client component.

## Tech stack

- **Framework**: Next.js App Router (TypeScript, strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Job queue**: pg-boss — one job registered, `research.run` (weekly schedule + on-demand). The separate Research Probe feature does not use pg-boss at all — it runs synchronously within its own API request.
- **Auth**: NextAuth v5 — credentials + Twilio Verify TOTP MFA, enforced at both the page and API layer
- **Styles**: Tailwind CSS v4 + Soft UI design system, navy/forest-green/copper palette
- **Secrets hygiene**: gitleaks pre-commit hook via husky
- **Deployment**: Railway (two services: `Zimplixio_Office` + `Worker`, one shared Postgres)

## Local setup

### Prerequisites

- Node.js 20 (via nvm)
- PostgreSQL running locally

> **Apple Silicon note:** The project uses an x86_64 Node binary via nvm. Normal terminal usage with nvm loaded works fine. For TypeScript checks inside Claude Code, prefix with the full binary path (see `CLAUDE.md`).

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate` automatically. `prepare` installs the gitleaks pre-commit hook (requires `gitleaks` on your machine — `brew install gitleaks`).

### 2. Set environment variables

Required variables — see `docs/ENV.md` for the full reference:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Any random string ≥32 chars (`openssl rand -base64 48`) |
| `ANTHROPIC_API_KEY` | Claude API key — used by both the Research Engine and the Research Probe |
| `TAVILY_API_KEY` | Tavily API key — used by both the Research Engine and the Research Probe. Required on **both** Railway services: the Research Probe calls it directly from the web service, not just the Worker |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify (TOTP MFA) |

### 3. Set up the database

```bash
npx prisma migrate dev   # apply all migrations
npm run seed             # create admin user + seed departments
```

### 4. Run

```bash
npm run dev
```

## Key commands

```bash
npm run dev                  # local dev server on :3000
npm run build                # production build
npm run seed                 # seed admin user + departments
npm run worker               # start pg-boss worker (research.run job)
npx prisma migrate dev       # apply schema changes + regenerate client
npx prisma generate          # regenerate Prisma client only
npx prisma studio            # visual DB browser
```

## Deployment (Railway)

Two services in the same Railway project, sharing one Postgres addon:

| Service | Build | Start |
|---|---|---|
| `Zimplixio_Office` | Railpack (auto-detected Next.js) | `npm run start` |
| `Worker` | `Dockerfile.worker` | `npm run worker` |

**Database migrations** run automatically on every `Zimplixio_Office` deploy, via a Pre-Deploy Command set directly on that service's Railway dashboard (`npx prisma migrate deploy` — deliberately *not* `railway.toml` config-as-code; see `CLAUDE.md` rule 11 for why). The `Worker` service has no pre-deploy step at all. For a one-off, out-of-band migration independent of a deploy:

```bash
DATABASE_URL="<Railway DATABASE_PUBLIC_URL>" npx prisma migrate deploy
```

Use `DATABASE_PUBLIC_URL` from the Postgres service variables (the internal hostname won't resolve from outside Railway).

See `docs/RAILWAY.md` for the full setup guide, DNS configuration, and environment variable tables, and `docs/SECURITY.md` for the auth/authorization/rate-limiting model.
