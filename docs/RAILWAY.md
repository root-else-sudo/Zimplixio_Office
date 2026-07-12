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
│  - Enqueues pg-boss jobs    │         │    (none registered yet —   │
│                             │         │    Research Engine lands    │
│                             │         │    here in Increment 3)     │
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

As of 2026-07-12, migrations run automatically on every deploy via Railway's **pre-deploy command** (`railway.toml`'s `[deploy] preDeployCommand = ["npx prisma migrate deploy"]`) — it runs after build, before the new container starts serving traffic, and the deploy is blocked (doesn't go live) if the migration fails. This closes the previous gap where a schema change could be pushed and deployed before anyone remembered to also migrate Railway's database by hand.

**Open question, not yet verified against a live deploy:** `railway.toml` lives at the repo root, and both the `Zimplixio_Office` and `Worker` services build from this same repo — it's not yet confirmed in the Railway dashboard whether the `Worker` service (which uses `Dockerfile.worker`, not Nixpacks) also picks up this `[deploy]` setting. If it does, `prisma migrate deploy` would run twice per push (once per service) — harmless since it's idempotent and Prisma takes an advisory lock while applying, just a few redundant seconds. Check the next real deploy's logs on both services to confirm the pre-deploy step actually ran, and on which service(s).

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

Minimal right now — no jobs are registered. Revisit once the Research Engine (Ground→Gather→Hypothesize→Test→Queue, Increment 3) lands; that will involve LLM calls and web scraping.

## Local development

```bash
npm run worker
```

Uses local `DATABASE_URL`. No other setup needed.
