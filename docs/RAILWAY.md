# Railway deployment topology

After Phase 4, the project deploys as **two Railway services in one project**, sharing one Postgres add-on. The web service handles HTTP and enqueues jobs; the worker service consumes jobs and runs the Python pipeline.

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  Service: office-web        │         │  Service: office-worker     │
│  (Next.js, this repo)       │         │  (Node + Python, this repo) │
│                             │         │                             │
│  npm run start              │         │  npm run worker             │
│                             │         │                             │
│  - HTTP API + UI            │         │  - pg-boss handlers         │
│  - Enqueues pg-boss jobs    │         │  - Spawns Marketing Python  │
│  - Reads PipelineEvent      │         │  - Writes PipelineEvent     │
│    rows for SSE             │         │    rows                     │
└──────────────┬──────────────┘         └──────────────┬──────────────┘
               │                                        │
               └─────────────┬──────────────────────────┘
                             ▼
                  ┌─────────────────────┐
                  │  Postgres add-on    │
                  │  (shared)           │
                  │                     │
                  │  - public schema    │
                  │    (Prisma models)  │
                  │  - pgboss schema    │
                  │    (queue state)    │
                  └─────────────────────┘
```

**Why a separate worker service.** A web deploy on Railway restarts the Next.js process — every push would interrupt in-flight pipeline jobs if the queue worker lived in the same process. The worker also runs Python subprocesses that need their own memory budget and lifecycle. Splitting the services means:

- web deploys never interrupt running pipelines
- worker can be scaled and restarted independently
- the worker image bundles the Marketing Python repo without bloating the web image
- web dyno stays small / cheap

**`src/instrumentation.ts` does NOT call `boss.start()`** — the web service only enqueues; it never consumes.

## Service: `office-web`

### Build

Default Railway Node detection works. `npm run build` → `npm run start`.

### Required env vars

These must be set on the web service (use Railway's `${{Postgres.DATABASE_URL}}` reference variable for the DB):

| Variable | Source |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_URL` | `https://<your-railway-domain>` |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 48` |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Twilio console |
| `TWILIO_WHATSAPP_FROM`, `WHATSAPP_NOTIFY_TO` | See `docs/ENV.md` |
| `VAPID_EMAIL`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Generate with `npx web-push generate-vapid-keys` |
| `LOG_LEVEL` | `info` |
| `PIPELINE_USE_QUEUE` | `false` initially → flip to `true` after the worker is verified |

`MARKETING_DIR` is **not required** on the web service in Phase 4 — the legacy fallback path is gated behind `PIPELINE_USE_QUEUE=false` and we recommend deploying with the flag on.

### SSE through Railway's proxy

The `/api/pipeline/[runId]/events` route uses Server-Sent Events. The implementation already includes:

- `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` headers
- 25-second `:keepalive` heartbeats to prevent idle disconnects
- 30-minute hard timeout per stream

If Railway introduces aggressive proxy timeouts in the future, the heartbeat interval is in [src/app/api/pipeline/[runId]/events/route.ts](../src/app/api/pipeline/[runId]/events/route.ts) (`HEARTBEAT_INTERVAL_MS`).

## Service: `office-worker`

### Build

Same repo, different start command. Configure on Railway:

- **Start command:** `npm run worker`
- **Builder:** Nixpacks (or use a custom Dockerfile if Python deps grow — see below)

### Bundling the Marketing Python pipeline

The worker spawns Python via `MARKETING_DIR/.venv/bin/python3`. On Railway, this directory must exist inside the worker container. Two approaches:

**Recommended: clone Marketing at a pinned SHA via custom Dockerfile.**

Create `worker/Dockerfile` (not yet committed — add when first deploying):

```dockerfile
FROM node:20-bookworm

# Marketing Python deps
RUN apt-get update && apt-get install -y python3 python3-venv python3-pip git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone Marketing at a pinned commit. MARKETING_REPO_REF is a build-time arg
# you set per deploy.
ARG MARKETING_REPO_REF=main
RUN git clone https://github.com/<your-org>/Zimplixio_Marketing.git /app/marketing \
    && cd /app/marketing \
    && git checkout "$MARKETING_REPO_REF" \
    && python3 -m venv .venv \
    && .venv/bin/pip install -r requirements.txt

# Office worker
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ENV MARKETING_DIR=/app/marketing
CMD ["npm", "run", "worker"]
```

To bump the Marketing repo: change `MARKETING_REPO_REF` in Railway service vars and redeploy. **Pin SHAs, not branches** — branches drift silently.

### Required env vars

| Variable | Source |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (same DB as web) |
| `MARKETING_DIR` | `/app/marketing` (or wherever the Dockerfile clones it) |
| `ANTHROPIC_API_KEY` | Anthropic console (needed if Marketing scripts call Claude) |
| `TWILIO_*`, `WHATSAPP_*`, `VAPID_*` | Same as web — worker fires `notifyDraftsReady` |
| `LINKEDIN_*` | When LinkedIn publish moves to the worker (Phase 5) |
| `LOG_LEVEL` | `info` |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Required by `serverEnv` schema even though the worker doesn't auth requests. Set them to dummy-but-valid values (e.g. the same as web) until the env schema is split per-service. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same as web — `clientEnv` is parsed when `notifications.ts` loads |

### Sizing

Pipeline runs spawn Python sub-processes that load LLM clients and process JSON. Start with the smallest worker plan that has at least 1 GB RAM. Monitor and bump if pipelines OOM.

## Cutover procedure

1. Deploy worker service with `PIPELINE_USE_QUEUE=false` on the web service. The worker is idle, no jobs are flowing.
2. Run `npm run worker` locally against the Railway Postgres (with the production `DATABASE_URL`) to verify pg-boss can connect and migrate its schema. **Or** just deploy the worker; pg-boss will migrate on first start.
3. On the web service, set `PIPELINE_USE_QUEUE=true` and redeploy.
4. Trigger a pipeline run from the dashboard. Watch the worker logs — you should see `pipeline.run picked up` followed by step-by-step events.
5. If anything goes wrong: set `PIPELINE_USE_QUEUE=false` on the web and redeploy. The legacy in-request path resumes.

## Rollback

Setting `PIPELINE_USE_QUEUE=false` on the web service is the one-click rollback. The worker can keep running idle (no cost beyond the dyno). The `pgboss` schema and `PipelineEvent` table are additive and safe to leave in place.

## Local development

The worker runs locally too:

```bash
npm run worker
```

It uses your local `DATABASE_URL` and `MARKETING_DIR`. To test the queue path without spinning up the worker, leave `PIPELINE_USE_QUEUE=false` in your local `.env`.
