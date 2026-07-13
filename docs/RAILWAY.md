# Railway deployment topology

The project deploys as **two Railway services in one project**, sharing one Postgres addon.

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  Service: Zimplixio_Office  │         │  Service: Worker            │
│  (Next.js, this repo)       │         │  (plain Node, this repo)    │
│                             │         │                             │
│  Railpack builder           │         │  Dockerfile.worker          │
│  npm run start              │         │  npm run worker             │
│                             │         │                             │
│  - HTTP API + UI            │         │  - pg-boss job handlers     │
│  - Enqueues pg-boss jobs    │         │    (research.run — weekly   │
│  - Also calls Tavily/Claude │         │    cron + on-demand)        │
│    directly (Research Probe)│         │                             │
└──────────────┬──────────────┘         └──────────────┬──────────────┘
               │                                        │
               └─────────────┬──────────────────────────┘
                             ▼
                  ┌─────────────────────┐
                  │  Postgres addon     │
                  │  (shared)           │
                  │                     │
                  │  - public schema    │
                  │    (Prisma models)  │
                  │  - pgboss schema    │
                  │    (queue state)    │
                  └─────────────────────┘
```

**Live URLs**
- Web: `https://crm.zimplixio.com` (custom domain via Cloudflare CNAME)
- Railway internal: `zimplixiooffice-production.up.railway.app`

## Service: `Zimplixio_Office` (web)

### Build

Railpack auto-detects Next.js. No custom build command needed. `railway.toml` sets the builder to NIXPACKS — no `startCommand` (Railpack detects `npm run start` automatically).

### Key env vars

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_URL` | `https://crm.zimplixio.com` |
| `NEXTAUTH_SECRET` | 32+ char random string |
| `AUTH_TRUST_HOST` | `1` — required when running behind Cloudflare proxy |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `TAVILY_API_KEY` | Tavily console — required here too: the Research Probe feature calls Tavily directly from this service, not just the Worker |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` | Twilio console — MFA |
| `LOG_LEVEL` | `info` |

Full variable list in `docs/ENV.md`.

### Cloudflare DNS

Two records on `zimplixio.com`:
- `CNAME www.crm → 2juecpif.up.railway.app` (Proxied)  ← unused (3rd-level SSL issue)
- `CNAME crm → 2juecpif.up.railway.app` (Proxied) ← active
- `TXT _railway-verify.www.crm → railway-verify=...` (DNS only)

SSL/TLS mode: **Full** (not Flexible).

`AUTH_TRUST_HOST=1` is required because Cloudflare sits in front of Railway — NextAuth v5 rejects requests from untrusted hosts without it.

### Database migration

Migrations run automatically on every Web deploy via a **Pre-Deploy Command set directly on the `Zimplixio_Office` service's dashboard** (Settings → Deploy → Pre-Deploy Command = `npx prisma migrate deploy`) — it runs after build, before the new container starts serving traffic, and the deploy is blocked (doesn't go live) if the migration fails.

**This is deliberately a per-service dashboard setting, not `railway.toml` config-as-code.** It was originally added to `railway.toml`'s `[deploy] preDeployCommand`, which applies repo-wide since both services build from the same root config file — this broke the `Worker` service specifically (2026-07-13): its pre-deploy step failed with `Error: The datasource.url property is required in your Prisma config file when using prisma migrate deploy`, because `prisma.config.ts` reads `DATABASE_URL` from `process.env` and that variable — despite being correctly set on the Worker service's Variables tab — isn't visible during Railway's pre-deploy execution context for this service (confirmed via Railway's own deployment diagnosis; a known category of Railway platform limitation, not a code bug). Attempting to override it with a per-service dashboard Pre-Deploy Command (set to a no-op `true`) also didn't take effect — the config-as-code value from `railway.toml` kept winning over the dashboard override, contrary to the usual expectation that dashboard settings take precedence.

The fix: `railway.toml`'s `[deploy]` section was removed entirely, and the Pre-Deploy Command is now set only on `Zimplixio_Office`'s own dashboard (Settings → Deploy), which was already confirmed working. `Worker`'s Pre-Deploy Command field is left empty — it never attempts a migration step at all, since nothing (neither `railway.toml` nor its own dashboard setting) tells it to.

Manual migration is still the right tool for a one-off, out-of-band schema change independent of a deploy (e.g. testing a migration against Railway before committing it):

```bash
DATABASE_URL="<Railway public URL>" npx prisma migrate deploy
```

Use `DATABASE_PUBLIC_URL` from the Postgres service variables (not `DATABASE_URL` which is the private hostname).

## Service: `Worker`

### Build

Uses `Dockerfile.worker` at repo root. Set in Railway → Settings → Build → Dockerfile path: `Dockerfile.worker`. Just a plain Node image now — no Python, no cloned repo (that was V1's Python-pipeline setup; removed as part of the v2 rebuild since the Research Engine is built as TypeScript modules the worker calls directly).

Start command: `npm run worker` (set directly as the Dockerfile `CMD`). No start command override needed in the Railway UI — `railway.toml` doesn't set one, so the Dockerfile's `CMD` runs automatically.

### Required env vars

Same schema as the web service — see `docs/ENV.md`. No worker-only vars right now (V1's `GITHUB_TOKEN`/`GITHUB_REPO_PATH`/`MARKETING_REPO_REF`/`GMAIL_*`/`R2_*` are gone along with the Python pipeline that needed them — remove them from the Worker's Railway variables whenever convenient).

### Sizing

Runs the Research Engine (Ground→Gather→Hypothesize→Test→Queue) on a weekly schedule (Monday 08:00 UTC) plus on-demand via the "Run now" button — each run makes LLM calls (Claude) and web searches (Tavily). Load is low-frequency and bursty rather than sustained; revisit sizing if a future department adds its own scheduled job.

## Local development

```bash
npm run worker
```

Uses local `DATABASE_URL`. No other setup needed.
