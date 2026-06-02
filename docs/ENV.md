# Environment Configuration — Zimplixio Office

Every secret and external path is validated **once at boot** through Zod schemas in `src/lib/env.ts` (server) and `src/lib/env-client.ts` (client). A misconfigured deploy fails to start with a readable error instead of crashing on first request.

## How it works

- `src/instrumentation.ts` runs `register()` on Node-runtime startup and imports `./lib/env`. Importing the module triggers `parseOrThrow(ServerSchema, process.env, 'server')`, which throws synchronously if anything is missing or malformed.
- `serverEnv` is the only place application code should read server secrets from. Importing it anywhere else gives you typed, validated values.
- `clientEnv` (in `env-client.ts`) handles `NEXT_PUBLIC_*` vars. They are inlined by Next.js at build time, so the client schema does NOT include any server-only secrets.
- `grep -r "process.env" src/` should only match: `instrumentation.ts` (Next.js runtime check), `env-client.ts` (the explicit client reader), and the worker bootstrap.

## Variables

### Core (both services)

| Name | Required? | Used by | Source of truth |
|---|---|---|---|
| `NODE_ENV` | yes (default `development`) | logger, prisma, next.config | Set by Next.js / Railway |
| `DATABASE_URL` | yes | Prisma + worker | Railway Postgres add-on (`${{Postgres.DATABASE_URL}}`) |
| `ANTHROPIC_API_KEY` | yes | `src/lib/ai-client.ts`, pipeline scripts | Anthropic console |
| `MARKETING_DIR` | required in worker | `/api/pipeline`, `/api/opportunities` | Path to local checkout (dev) / `/app/marketing` (worker) |
| `TWILIO_ACCOUNT_SID` | yes | `src/lib/twilio.ts` | Twilio console |
| `TWILIO_AUTH_TOKEN` | yes | `src/lib/twilio.ts` | Twilio console |
| `TWILIO_VERIFY_SERVICE_SID` | yes | TOTP MFA setup/verify | Twilio Verify service |
| `TWILIO_WHATSAPP_FROM` | yes (must start with `whatsapp:`) | `sendWhatsApp()` | Twilio sandbox: `whatsapp:+14155238886` |
| `WHATSAPP_NOTIFY_TO` | yes | `notifyDraftsReady()` | Recipient number that opted into the sandbox |
| `VAPID_EMAIL` | yes (email format) | `webpush.setVapidDetails` | Contact email for push provider |
| `VAPID_PRIVATE_KEY` | yes | `webpush.setVapidDetails` | Generated once with `npx web-push generate-vapid-keys` |
| `LOG_LEVEL` | optional (default `info`) | `pino` logger | One of `fatal\|error\|warn\|info\|debug\|trace` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | yes | `Sidebar.tsx`, `notifications.ts` | Pair of `VAPID_PRIVATE_KEY` |

### Web service only (`Zimplixio_Office`)

| Name | Required? | Used by | Source of truth |
|---|---|---|---|
| `NEXTAUTH_URL` | yes | NextAuth callbacks | `https://crm.zimplixio.com` (prod) / `http://localhost:3000` (dev) |
| `NEXTAUTH_SECRET` | yes (≥ 32 chars) | NextAuth JWT signing | Generate once with `openssl rand -base64 48` |
| `AUTH_TRUST_HOST` | yes in production | NextAuth v5 | Set to `1` — required when running behind Cloudflare proxy |
| `PIPELINE_USE_QUEUE` | optional (default `false`) | `/api/pipeline` route | `true` = enqueue to pg-boss worker; `false` = inline subprocess (legacy) |

### Worker service only (`Worker`)

| Name | Required? | Used by | Notes |
|---|---|---|---|
| `GITHUB_TOKEN` | yes | `start-worker.sh` | GitHub PAT with `repo` read scope, no expiration |
| `GITHUB_REPO_PATH` | yes | `start-worker.sh` | `root-else-sudo/Zimplixio_Marketing` |
| `MARKETING_REPO_REF` | yes | `start-worker.sh` | Branch/tag to clone — currently `master` |
| `TAVILY_API_KEY` | yes | `context_search.py` | Tavily console |
| `GMAIL_CLIENT_ID` | yes | `gmail_auth.py` | From Google Cloud `credentials.json` |
| `GMAIL_CLIENT_SECRET` | yes | `gmail_auth.py` | From Google Cloud `credentials.json` |
| `GMAIL_REFRESH_TOKEN_READONLY` | yes | `emails_fetch.py` | From `token.json` after local OAuth run — regenerate if `invalid_grant` |
| `GMAIL_REFRESH_TOKEN_MODIFY` | yes | `emails_organize.py` | From `token_modify.json` after local OAuth run — regenerate if `invalid_grant` |
| `R2_ACCOUNT_ID` | yes | `r2_storage.py` | Cloudflare account ID (`0d653500d8aa8a059d729920b21141ed`) |
| `R2_ACCESS_KEY_ID` | yes | `r2_storage.py` | Cloudflare R2 API token (Account API token, not `cfat_` Cloudflare token) |
| `R2_SECRET_ACCESS_KEY` | yes | `r2_storage.py` | Cloudflare R2 |
| `R2_BUCKET_NAME` | yes | `r2_storage.py` | `zimplixio-marketing` |

> **Gmail tokens:** The OAuth app is published to Production — tokens do not expire. To regenerate: `rm token.json token_modify.json` then run `emails_fetch.py` and `emails_organize.py` locally with `PYTHONPATH=execution python execution/<script>.py` from the `Zimplixio_Marketing` root. Update `GMAIL_REFRESH_TOKEN_READONLY` and `GMAIL_REFRESH_TOKEN_MODIFY` in Railway Worker.

### LinkedIn (optional, not yet wired)

| Name | Required? | Used by | Source of truth |
|---|---|---|---|
| `LINKEDIN_ACCESS_TOKEN` | optional (stub) | `publishToLinkedIn()` | LinkedIn OAuth |
| `LINKEDIN_AUTHOR_ID` | optional (stub) | `publishToLinkedIn()` | `urn:li:organization:<id>` |

## Per-service configuration on Railway

| Variable | Web service (`Zimplixio_Office`) | Worker service (`Worker`) |
|---|---|---|
| `DATABASE_URL` | yes | yes (same Postgres, via `${{Postgres.DATABASE_URL}}`) |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | yes | yes (worker shares `env.ts` schema) |
| `AUTH_TRUST_HOST` | yes (`1`) | yes |
| `ANTHROPIC_API_KEY` | yes | yes |
| `PIPELINE_USE_QUEUE` | yes (`true`) | n/a |
| `MARKETING_DIR` | optional | auto-set by `start-worker.sh` to `/app/marketing` |
| `GITHUB_TOKEN` / `GITHUB_REPO_PATH` / `MARKETING_REPO_REF` | no | yes |
| Twilio + VAPID + WhatsApp | yes | yes (worker fires notifications) |
| `TAVILY_API_KEY` | n/a (scripts run in worker) | yes |
| `GMAIL_*` | no | yes |
| `R2_*` | no | yes |
| `LINKEDIN_*` | optional | optional |

Use Railway's reference variables (`${{Postgres.DATABASE_URL}}`) so both services stay in sync without manual copy-paste.

## Logging

`pino` is configured in `src/lib/logger.ts`:
- Pretty-printed in dev (`NODE_ENV=development`); JSON in prod.
- Redacts `authorization`, `cookie`, `password`, `passwordHash`, `apiKey`, `api_key`, `token`, `secret`, `mfaSecret` at any depth.
- Use `logger.child({ ... })` or the `routeLogger(name)` helper to scope context per request/job.

## Local dev

Keep your `.env` (already gitignored) at the repo root. Required minimum to boot:

```
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<32+ chars>
ANTHROPIC_API_KEY=sk-ant-...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_NOTIFY_TO=+1...
VAPID_EMAIL=you@example.com
VAPID_PRIVATE_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
MARKETING_DIR=/Users/you/Documents/Zimplixio_Marketing
```

Keep `PIPELINE_USE_QUEUE` unset (or `false`) to run pipeline inline without needing the worker process.
