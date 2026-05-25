# Railway deployment topology

The project deploys as **two Railway services in one project**, sharing one Postgres addon.

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  Service: Zimplixio_Office  │         │  Service: Worker            │
│  (Next.js, this repo)       │         │  (Node + Python, this repo) │
│                             │         │                             │
│  Railpack builder           │         │  Dockerfile.worker          │
│  npm run start              │         │  scripts/start-worker.sh    │
│                             │         │                             │
│  - HTTP API + UI            │         │  - Clones Zimplixio_Marketing│
│  - Enqueues pg-boss jobs    │         │  - pg-boss job handlers     │
│  - Reads PipelineEvent      │         │  - Spawns Python scripts    │
│    rows for live progress   │         │  - Writes PipelineEvent rows│
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
| `PIPELINE_USE_QUEUE` | `true` — enqueues jobs to pg-boss worker |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `TWILIO_*`, `WHATSAPP_*` | Twilio console |
| `VAPID_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push keys |
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

Migrations are applied manually via local CLI (not as a Railway release command):

```bash
DATABASE_URL="<Railway public URL>" npx prisma migrate deploy
```

Use `DATABASE_PUBLIC_URL` from the Postgres service variables (not `DATABASE_URL` which is the private hostname).

## Service: `Worker`

### Build

Uses `Dockerfile.worker` at repo root. Set in Railway → Settings → Build → Dockerfile path: `Dockerfile.worker`.

No start command override needed — the Dockerfile `CMD ["/start-worker.sh"]` runs automatically (do not set a custom start command in Railway UI, as `railway.toml` would override it).

### Startup sequence (`scripts/start-worker.sh`)

1. Removes any stale `/app/marketing` directory
2. Clones `Zimplixio_Marketing` at `MARKETING_REPO_REF` (default: `master`) using `GITHUB_TOKEN`
3. Creates Python venv, installs `requirements.txt`
4. Sets `MARKETING_DIR=/app/marketing`
5. Runs `npm run worker` (pg-boss worker process)

### Required env vars

All web service vars plus:

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT with `repo` read scope, no expiration |
| `GITHUB_REPO_PATH` | `root-else-sudo/Zimplixio_Marketing` |
| `MARKETING_REPO_REF` | `master` |
| `TAVILY_API_KEY` | Tavily console — **pending** |
| `GMAIL_CLIENT_ID` | From `credentials.json` — **pending** |
| `GMAIL_CLIENT_SECRET` | From `credentials.json` — **pending** |
| `GMAIL_REFRESH_TOKEN_READONLY` | From `token.json` — **pending** |
| `GMAIL_REFRESH_TOKEN_MODIFY` | From `token_modify.json` — **pending** (requires local run first) |
| `R2_ACCOUNT_ID` | Cloudflare R2 — **pending** |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 — **pending** |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 — **pending** |
| `R2_BUCKET_NAME` | Cloudflare R2 — **pending** |

Items marked **pending** are required for the full pipeline (Gmail fetch + R2 market context cache). Without them the worker starts but pipeline jobs will fail at the Gmail auth step.

### Sizing

Pipeline runs spawn Python subprocesses loading LLM clients and processing JSON. Minimum 1 GB RAM recommended.

## Rollback

Set `PIPELINE_USE_QUEUE=false` on the web service — reverts to the legacy in-request subprocess path. The worker stays running idle (no cost beyond the dyno).

## Local development

```bash
npm run worker
```

Uses local `DATABASE_URL` and `MARKETING_DIR`. Keep `PIPELINE_USE_QUEUE=false` in `.env` to run without the worker.
