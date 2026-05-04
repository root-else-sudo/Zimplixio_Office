# Audit trail & human-in-the-loop tooling

After Phase 5, every reviewer decision is attributable, every content state of a post is preserved, and every external side-effect (LinkedIn publish today; future kinds slot in trivially) flows through a retryable outbox row. Notifications fire on the events that matter: a pipeline failure, an approved post going live, a post failing to publish, and any draft that's been waiting longer than 24 hours.

## Data model

### `Post` audit fields

| Column | When set | Set by |
|---|---|---|
| `approvedById` / `approvedAt` | Status flips to `APPROVED` | Session user on `PATCH /api/posts/{id}` |
| `rejectedById` / `rejectedAt` / `rejectionReason` | Status flips to `REJECTED` | Session user on `PATCH /api/posts/{id}` |
| `status` ⇒ `PUBLISHED` | LinkedIn `Webhook` row succeeds | Worker `linkedin.publish` handler |

The PATCH handler clears stale rejection fields when a post is re-approved (and vice versa) so the row always reflects the current decision, not the most recent of every kind.

### `PostVersion` — immutable history of post states

Every change to `Post.content` (and the original generation) appends a row.

| Field | Notes |
|---|---|
| `version` | Monotonically increasing per post. Unique constraint on `(postId, version)` is the safety net against rare concurrent writes |
| `source` | `ORIGINAL` (pipeline ingest) · `REGENERATED` (every call to `/api/posts/{id}/regenerate` — recorded as a candidate even if not adopted) · `EDITED` (every PATCH that changes content) |
| `feedback` | jsonb. For `REGENERATED`: `{ selectedOptions, freeText }`. For `EDITED`: free-form (PATCH may pass `{source, feedback}` to attribute the edit to e.g. an accepted regenerate candidate) |
| `createdBy` | userId. `null` only for `ORIGINAL` (no human authored it) |

**Why `REGENERATED` is recorded even when not adopted.** The reviewer often iterates several regenerations before picking one. Capturing every candidate makes the history page show the *path* the reviewer took, not just the final state — much more useful for understanding *why* the published copy reads the way it does.

### `Webhook` — outbox for external side-effects

Every approval that needs to ship to LinkedIn writes a `Webhook` row inside the same transaction as the `Post` update. The pg-boss enqueue happens *after* commit, so the row is the source of truth — if enqueue fails we still have a `PENDING` row with `lastError` set, which a future re-enqueue sweep can retry.

| Status | Meaning |
|---|---|
| `PENDING` | Created. Waiting for / running its first attempt |
| `SUCCEEDED` | Delivered. `deliveredAt` set, `Post.status = PUBLISHED`, `notifyPostPublished` fired |
| `FAILED` | Hit the retry ceiling. `lastError` populated, `notifyPostPublishFailed` fired |

Retry policy: pg-boss `retryLimit: 3` on the job, plus a hard ceiling inside the handler. When `attempts == 3` the handler stops re-throwing, finalises the row to `FAILED`, and notifies — preventing pg-boss from retrying past the operator-visible limit.

## Notifications

All four go to WhatsApp + every registered web push subscriber via `src/lib/notifications.ts`.

| Function | Fires when | Body |
|---|---|---|
| `notifyDraftsReady(count)` | Pipeline ingest succeeds with ≥ 1 post | "Pipeline complete — N post(s) saved for review." |
| `notifyPipelineFailed(runId, summary)` | Any failure path in `worker/src/handlers/pipeline.ts` | "Run {short-id} failed: {summary}" |
| `notifyDraftStale(postId, ageHours)` | Cron sweep finds `DRAFT` posts where `updatedAt` < now − 24h | "Post {short-id} has been waiting {N}h for review." |
| `notifyPostPublished(postId)` | `Webhook(LINKEDIN_PUBLISH)` succeeds | "Post {short-id} is now live on LinkedIn." |
| `notifyPostPublishFailed(postId, summary)` | `Webhook(LINKEDIN_PUBLISH)` exhausts retries | "Post {short-id} could not be published after retries: {summary}" |

Each one is wrapped in a `safeNotify*` helper at the call site so a Twilio outage never crashes the worker handler that's trying to finalise the underlying record.

### Stale-draft cron

`worker/src/handlers/cron.ts` runs every 6 hours via `boss.schedule(JOB_NAMES.STALE_DRAFTS_CHECK, '0 */6 * * *', ...)`. It scans for `DRAFT` posts where `updatedAt` is older than 24 hours, capped at 50 per tick. The "was it touched in the last 24h" check uses Prisma's `updatedAt`, which is bumped by every PATCH — so a draft that was edited 10 hours ago doesn't trigger a stale notification yet.

## Querying

### Who approved a given post?

```sql
SELECT id, status, "approvedById", "approvedAt"
FROM "Post"
WHERE id = '<post-id>';
```

### Full version history for a post (UI: `/posts/{id}/history`)

```sql
SELECT version, source, "createdBy", "createdAt", feedback
FROM "PostVersion"
WHERE "postId" = '<post-id>'
ORDER BY version ASC;
```

The dashboard page renders this as a timeline plus a side-by-side diff (any two versions). The picker defaults to v1 vs the latest version.

### Outbox status

```sql
SELECT id, status, attempts, "lastError", "createdAt", "deliveredAt"
FROM "Webhook"
WHERE kind = 'LINKEDIN_PUBLISH'
ORDER BY "createdAt" DESC;
```

PENDING rows older than ~10 minutes that are not currently being processed by pg-boss indicate a stalled enqueue (the post-commit `enqueueLinkedInPublish` call failed). Manually re-enqueue:

```sh
# From a local shell with worker env:
node -e "import('./src/lib/jobs.js').then(j => j.enqueueLinkedInPublish({ webhookId: '<row-id>' }))"
```

## Retention

No automatic purge yet. Three tables are the candidates as volume grows:

- `PostVersion` — immutable; retain forever for now. Compressing or archiving old `ORIGINAL`/`REGENERATED` content blocks (TEXT) makes sense once the table crosses ~100k rows.
- `Webhook` — purge `SUCCEEDED` rows older than 30 days as a follow-up cron when convenient. `FAILED` rows should stay so failures remain queryable.
- `PipelineEvent` (Phase 4) — bounded by run count. A run cleanup that drops events for `PipelineRun`s older than 90 days is a reasonable follow-up.

## Backfill

For posts created before Phase 5, run once:

```sh
npm run backfill:post-versions
```

It writes a `PostVersion` v1 (`source: ORIGINAL`) for every existing post that has no version rows. Idempotent — safe to re-run.

## Rollback notes

The audit columns (`approvedById`, `approvedAt`, `rejectedById`, `rejectedAt`, `rejectionReason`) and the `PostVersion` / `Webhook` tables are additive — leaving them in place after a rollback causes no functional issues.

If the LinkedIn outbox handler misbehaves: disable it by removing the `linkedin.publish` `boss.work(...)` registration in `worker/src/index.ts` and redeploy the worker. The PATCH handler will continue creating `Webhook` rows in `PENDING`; they sit there until you re-enable the handler or replay manually.

If the cron handler misbehaves: `boss.unschedule(JOB_NAMES.STALE_DRAFTS_CHECK)` from a one-shot script will stop it; redeploy with the `boss.schedule(...)` line removed for a permanent disable.
