# Zimplixio Office — Operating Instructions

## What This Is
A Next.js dashboard that serves as the control center for Zimplixio's marketing operations. It:
- Triggers and monitors the email → LinkedIn posts pipeline
- Displays, reviews, and approves/rejects generated post drafts
- Shows pipeline run history and agent status with a live flow visualization
- Surfaces AI-generated business opportunities (Tavily + Claude)
- Delivers notifications via WhatsApp (Twilio) and browser push

## How It Connects to Zimplixio_Marketing
The dashboard triggers Python scripts that live in the `Zimplixio_Marketing` project. In production (`PIPELINE_USE_QUEUE=true`) the web service enqueues a pg-boss job; the Worker service clones the marketing repo at startup and handles those jobs, spawning Python scripts as child processes and writing results to PostgreSQL. In local dev (`PIPELINE_USE_QUEUE=false`) the web API route spawns scripts directly. The connection is configured via `MARKETING_DIR` (set to `/Users/josephugaldeberrocal/Documents/Zimplixio_Marketing` locally; set to `/app/marketing` automatically by the worker's `start-worker.sh`).

## Tech Stack
- **Framework**: Next.js App Router (server + client components)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Job queue**: pg-boss (pipeline, LinkedIn publish, opportunities, stale-draft cron)
- **Auth**: NextAuth v5 (credentials + TOTP MFA)
- **Styles**: Tailwind CSS + custom Soft UI design system in `src/app/globals.css`
- **Charts**: Recharts
- **Notifications**: Twilio WhatsApp + Web Push (VAPID)
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
4. **Never hardcode MARKETING_DIR** — always use the env var
5. **No posts go live without explicit user action** — the dashboard shows drafts; the user approves
6. **Use lazy initialization for SDK clients** — never call `new Anthropic()`, `twilio()`, or `webpush.setVapidDetails()` at module level. `next build` runs module-level code without env vars injected, causing crashes. Wrap in a lazy getter called at request time.

## Key Environment Variables

See `docs/ENV.md` for the full reference. Vars that affect code behavior:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PIPELINE_USE_QUEUE` | `false` (dev, inline subprocess) / `true` (prod, pg-boss worker) |
| `MARKETING_DIR` | Absolute path to Zimplixio_Marketing project root |
| `AUTH_TRUST_HOST` | Set to `1` in production — required behind Cloudflare proxy |
