# Zimplixio Office

The control center for Zimplixio's marketing operations. A Next.js dashboard that orchestrates AI-powered content pipelines, surfaces business opportunities, and manages project work — all with a human-in-the-loop approval layer before anything goes live.

## What it does

| Section | Purpose |
|---|---|
| **Pipeline** | Triggers and monitors the email → LinkedIn post pipeline. Shows live step progress. |
| **Posts** | Review, edit, regenerate, approve, or reject AI-generated LinkedIn drafts. |
| **Opportunities** | AI-surfaced business leads (Tavily + Claude). |
| **Projects** | Gantt-style project tracker with phase/task hierarchy and dependency arrows. Supports agent-proposed tasks with inline approve/reject. |
| **Calendar** | Scheduled pipeline and post timeline. |
| **Admin → AI Usage** | Token counts, latency, and cost breakdown per Claude API call. |

## Architecture

This repo is one half of a two-repo system:

```
zimplixio-office (this repo)          Zimplixio_Marketing (Python repo)
─────────────────────────────         ──────────────────────────────────
Next.js app + pg-boss worker    ←───  Python pipeline scripts
Prisma / PostgreSQL                   Gmail API, Tavily, Claude
Railway: office-web service           MARKETING_DIR env var points here
Railway: office-worker service
```

The worker service (separate Railway service, built from `Dockerfile.worker`) clones the marketing repo at startup, runs the Python scripts as child processes, validates their JSON output with Zod, and writes results to the database. The two repos communicate **only through the database and job queue** — never through the filesystem in production.

### Page pattern

```
page.tsx (server)  →  props  →  PageClient.tsx (client)
                                       ↕ fetch
                               /api/[route]/route.ts
                                       ↕
                                     Prisma
```

Server components fetch from Prisma and pass serialized data to client components. Client components own UI state and call API routes for mutations.

## Tech stack

- **Framework**: Next.js 16 App Router (TypeScript, strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Job queue**: pg-boss (pipeline runs, LinkedIn publish, opportunities)
- **Auth**: NextAuth v5 — credentials + TOTP MFA
- **Styles**: Tailwind CSS v4 + Soft UI design system
- **Charts**: Recharts
- **Notifications**: Twilio WhatsApp + Web Push (VAPID)
- **Deployment**: Railway (two services: `office-web` + `office-worker`)

## Local setup

### Prerequisites

- Node.js 20 (via nvm)
- PostgreSQL running locally
- Python 3 + the `Zimplixio_Marketing` repo cloned alongside this one

> **Apple Silicon note:** The project uses an x86_64 Node binary via nvm. Normal terminal usage with nvm loaded works fine. For TypeScript checks inside Claude Code, prefix with the full binary path (see `CLAUDE.md`).

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate` automatically.

### 2. Set environment variables

Copy `.env.example` to `.env` and fill in values. Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Any random string (`openssl rand -base64 48`) |
| `MARKETING_DIR` | Absolute path to `Zimplixio_Marketing` repo root |
| `ANTHROPIC_API_KEY` | Claude API key |
| `TAVILY_API_KEY` | Tavily search API key |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify (TOTP MFA) |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` |
| `WHATSAPP_NOTIFY_TO` | Recipient WhatsApp number |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push public key |
| `VAPID_PRIVATE_KEY` | Web push private key |
| `VAPID_EMAIL` | Web push contact email |

### 3. Set up the database

```bash
npx prisma migrate dev   # apply all migrations
npm run seed             # create admin user + seed master plan project
```

### 4. Run

```bash
npm run dev
```

Pipeline runs locally via subprocess — no worker process needed (`PIPELINE_USE_QUEUE` defaults to `false`).

## Key commands

```bash
npm run dev                  # local dev server on :3000
npm run build                # production build
npm run seed                 # seed admin user + projects
npm run worker               # start pg-boss worker (production only)
npx prisma migrate dev       # apply schema changes + regenerate client
npx prisma generate          # regenerate Prisma client only
npx prisma studio            # visual DB browser
```

## Deployment (Railway)

Two services in the same Railway project:

| Service | Build | Start |
|---|---|---|
| `office-web` | Railpack (auto-detected Next.js) | `npm run start` |
| `office-worker` | `Dockerfile.worker` | `/start-worker.sh` |

The worker startup script (`scripts/start-worker.sh`) clones `Zimplixio_Marketing`, creates a Python venv, installs from `requirements.txt`, and starts the worker process.

**Release command** on `office-web`:
```
npx prisma migrate deploy
```

See the master plan for the full Railway setup walkthrough and the complete environment variable tables for both services.

## Agent architecture

Every pipeline agent follows a 6-layer contract:

1. **Directive** (`Zimplixio_Marketing/directives/`) — Markdown SOP: inputs, outputs, approval gates, edge cases
2. **Execution** (`Zimplixio_Marketing/execution/`) — Deterministic Python scripts, one thing each (`noun_verb.py`)
3. **Output contract** — JSON file schema validated by Zod in the worker handler
4. **Worker handler** (`worker/src/handlers/`) — spawns scripts, emits `PipelineEvent` rows, writes to DB in a transaction
5. **Database models** — Prisma schema is the single source of truth
6. **API routes + UI** — list results, approve/reject; nothing leaves externally without explicit user action

**Rule:** scheduled or batch AI operations live in Python. Interactive, user-triggered operations on a single record live in Next.js API routes.
