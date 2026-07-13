# Environment Configuration — Zimplixio Office

Every secret is validated **once at boot** through a Zod schema in `src/lib/env.ts`. A misconfigured deploy fails to start with a readable error instead of crashing on first request.

## How it works

- `src/instrumentation.ts` runs `register()` on Node-runtime startup and imports `./lib/env`. Importing the module triggers `parseOrThrow(ServerSchema, process.env, 'server')`, which throws synchronously if anything is missing or malformed.
- `serverEnv` is the only place application code should read server secrets from. Importing it anywhere else gives you typed, validated values.
- **During `next build`**, `serverEnv` is deliberately an empty object (env vars aren't injected at build time) — see the comment in `src/lib/env.ts`. Any page that statically prerenders and touches the DB or a secret will crash the build; auth-gated / DB-backed pages must set `export const dynamic = 'force-dynamic'` (CLAUDE.md rule 7).
- There is currently no client-side (`NEXT_PUBLIC_*`) env schema — the Web Push feature that needed one (`env-client.ts`, VAPID keys) was removed with the rest of V1. Add one back if a future feature needs client-exposed config.

## Variables

Both services (`Zimplixio_Office` web + `Worker`) share the same env schema and the same Postgres.

| Name | Required? | Used by |
|---|---|---|
| `NODE_ENV` | no (default `development`) | logger, prisma, next.config |
| `DATABASE_URL` | yes | Prisma (web + worker) — Railway Postgres add-on (`${{Postgres.DATABASE_URL}}`) |
| `NEXTAUTH_URL` | yes | NextAuth callbacks |
| `NEXTAUTH_SECRET` | yes (≥ 32 chars) | NextAuth JWT signing |
| `AUTH_TRUST_HOST` | yes in production | NextAuth v5 — required behind the Cloudflare/Railway proxy |
| `ANTHROPIC_API_KEY` | yes | `src/lib/ai-client.ts` — reusable Claude wrapper; used by the Research Engine's Hypothesize/Test calls (Worker) and the Research Probe's Hypothesize/Test calls (`src/lib/research-probe/`, called directly from the web service) |
| `TAVILY_API_KEY` | yes | `src/lib/research/tavily.ts` — Research Engine's Gather step (Worker) — and `src/lib/research-probe/gather.ts` — Research Probe's Gather step, called directly from the **web** service via `POST /api/research-probe/run` (synchronous, no job queue). Required on both services; `serverEnv` is validated at boot on both (`src/instrumentation.ts`) |
| `TWILIO_ACCOUNT_SID` | yes | `src/lib/twilio.ts` — MFA (TOTP) |
| `TWILIO_AUTH_TOKEN` | yes | `src/lib/twilio.ts` — MFA (TOTP) |
| `TWILIO_VERIFY_SERVICE_SID` | yes | TOTP MFA setup/verify |
| `TWILIO_SMS_FROM` | optional | `sendSMS()` in `src/lib/twilio.ts` — not currently called anywhere; kept as optional infra for a future notification feature |
| `SMS_NOTIFY_TO` | optional | pairs with `TWILIO_SMS_FROM` |
| `LOG_LEVEL` | optional (default `info`) | `pino` logger — one of `fatal\|error\|warn\|info\|debug\|trace` |

> **Legacy vars (V1/Python-pipeline era):** `PIPELINE_USE_QUEUE`, `MARKETING_DIR` — still declared as optional in the schema so nothing crashes if they're still set in Railway, but no code path uses them anymore. Safe to remove from Railway whenever convenient.

Use Railway's reference variables (`${{Postgres.DATABASE_URL}}`) so both services stay in sync without manual copy-paste.

## Logging

`pino` is configured in `src/lib/logger.ts`:
- Pretty-printed in dev (`NODE_ENV=development`); JSON in prod.
- Redacts `authorization`, `cookie`, `password`, `passwordHash`, `apiKey`, `api_key`, `token`, `secret`, `mfaSecret` at any depth.
- Use `logger.child({ ... })` or the `routeLogger(name)` helper to scope context per request/job.

## Local dev

Keep your `.env` (gitignored) at the repo root. Required minimum to boot:

```
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<32+ chars>
ANTHROPIC_API_KEY=sk-ant-...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
```
