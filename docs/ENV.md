# Environment Configuration — Zimplixio Office

After Phase 2, every secret and external path is validated **once at boot** through Zod schemas in `src/lib/env.ts` (server) and `src/lib/env-client.ts` (client). A misconfigured deploy fails to start with a readable error instead of crashing on first request.

## How it works

- `src/instrumentation.ts` runs `register()` on Node-runtime startup and imports `./lib/env`. Importing the module triggers `parseOrThrow(ServerSchema, process.env, 'server')`, which throws synchronously if anything is missing or malformed.
- `serverEnv` is the only place application code should read server secrets from. Importing it anywhere else gives you typed, validated values.
- `clientEnv` (in `env-client.ts`) handles `NEXT_PUBLIC_*` vars. They are inlined by Next.js at build time, so the client schema does NOT include any server-only secrets.
- `grep -r "process.env" src/` should only match: `instrumentation.ts` (Next.js runtime check), `env-client.ts` (the explicit client reader), and any future Phase-4 worker bootstrap.

## Variables

| Name | Required? | Used by | Source of truth |
|---|---|---|---|
| `NODE_ENV` | yes (default `development`) | logger, prisma, next.config | Set by Next.js / Railway |
| `DATABASE_URL` | yes | Prisma + worker (Phase 4) | Railway Postgres add-on (`${{Postgres.DATABASE_URL}}`) |
| `NEXTAUTH_URL` | yes | NextAuth callbacks | `https://<your-railway-domain>` |
| `NEXTAUTH_SECRET` | yes (≥ 32 chars) | NextAuth JWT signing | Generate once with `openssl rand -base64 48` |
| `ANTHROPIC_API_KEY` | yes | `src/lib/ai-client.ts` (analyze/regenerate today; broader use in Phase 3) | Anthropic console |
| `MARKETING_DIR` | optional in web; **required in worker (Phase 4)** | `/api/pipeline`, `/api/opportunities` | Path to local Zimplixio_Marketing checkout (dev) / cloned path (worker image) |
| `TWILIO_ACCOUNT_SID` | yes | `src/lib/twilio.ts` | Twilio console |
| `TWILIO_AUTH_TOKEN` | yes | `src/lib/twilio.ts` | Twilio console |
| `TWILIO_VERIFY_SERVICE_SID` | yes | TOTP MFA setup/verify | Twilio Verify service |
| `TWILIO_WHATSAPP_FROM` | yes (must start with `whatsapp:`) | `sendWhatsApp()` | Twilio sandbox: `whatsapp:+14155238886` |
| `WHATSAPP_NOTIFY_TO` | yes | `notifyDraftsReady()` | Recipient number that opted into the sandbox |
| `VAPID_EMAIL` | yes (email format) | `webpush.setVapidDetails` | Contact email for push provider |
| `VAPID_PRIVATE_KEY` | yes | `webpush.setVapidDetails` | Generated once with `npx web-push generate-vapid-keys` |
| `LINKEDIN_ACCESS_TOKEN` | optional (stub) | `publishToLinkedIn()` | LinkedIn OAuth — wired up in Phase 5 |
| `LINKEDIN_AUTHOR_ID` | optional (stub) | `publishToLinkedIn()` | `urn:li:organization:<id>` |
| `LOG_LEVEL` | optional (default `info`) | `pino` logger | One of `fatal\|error\|warn\|info\|debug\|trace` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | yes | `Sidebar.tsx`, `notifications.ts` | Pair of `VAPID_PRIVATE_KEY` |

## Per-service configuration on Railway (forward-looking)

Phase 4 introduces a separate `office-worker` Railway service. The split:

| Variable | Web service | Worker service |
|---|---|---|
| `DATABASE_URL` | yes | yes (same Postgres) |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | yes | no |
| `ANTHROPIC_API_KEY` | yes | yes |
| `MARKETING_DIR` | optional | **required** (worker holds the cloned Marketing repo) |
| `MARKETING_REPO_REF` | n/a | **required** (pinned commit SHA — bumped via redeploy) |
| Twilio + VAPID + WhatsApp | yes (web triggers MFA + push) | yes (worker fires pipeline-complete + stale-draft notifications) |
| `LINKEDIN_*` | optional | yes (worker owns the publish job) |

Use Railway's reference variables (`${{Postgres.DATABASE_URL}}`) so both services stay in sync without manual copy-paste.

## Logging

`pino` is configured in `src/lib/logger.ts`:
- Pretty-printed in dev (`NODE_ENV=development`); JSON in prod.
- Redacts `authorization`, `cookie`, `password`, `passwordHash`, `apiKey`, `api_key`, `token`, `secret`, `mfaSecret` at any depth.
- Use `logger.child({ ... })` or the `routeLogger(name)` helper to scope context per request/job.

## Local dev

Keep your `.env` (already gitignored) at the repo root. Required minimum to boot today:

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
```

`MARKETING_DIR` is optional but the pipeline routes will throw at request time without it.
