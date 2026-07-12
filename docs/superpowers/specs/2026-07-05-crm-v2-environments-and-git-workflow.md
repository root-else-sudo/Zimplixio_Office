# Zimplixio CRM v2 — Environments & Git Workflow

| Field | Value |
|---|---|
| **Document Type** | Operational Specification (environments + branching) |
| **Companion To** | Zimplixio CRM v2 — Planning (2026-07-03); Design System (2026-07-03) |
| **Version** | 1.0 (draft) |
| **Date Issued** | 2026-07-05 |
| **Owner** | Joe Ugalde |
| **Consumer** | Claude Code (implementation) |
| **Status** | Dev infrastructure live; production designed, not yet provisioned |

---

## Implementation Status (as of 2026-07-12)

This document remains the accurate, current reference for the git/environment model (it superseded the Planning doc's more tentative §5). Updates since it was written:

- **§1 Housekeeping — done.** The stray `claude/jovial-swartz-c027ce` branch (confirmed merged into both `main` and `development`) was deleted 2026-07-10.
- **§3.3 / §4 Migration flow — now genuinely automated, not just diagrammed.** As of 2026-07-12, `railway.toml` sets a Railway pre-deploy command (`[deploy] preDeployCommand = ["npx prisma migrate deploy"]`) — migrations against the `development` Railway Postgres now run automatically as part of every deploy, blocking the deploy from going live if the migration fails. Previously this was a separate manual step run by hand from a local terminal (still documented as a fallback for one-off, out-of-band migrations in `docs/RAILWAY.md`). One open item: it's not yet confirmed whether the `Worker` service (which builds via `Dockerfile.worker`, not Nixpacks) also picks up this same root-level `railway.toml` setting — if so, the migration would just run twice per push, which is harmless (idempotent, advisory-locked) but worth checking in the Railway dashboard.
- **§2 Railway Environments — unchanged.** Still only `development` provisioned; `production` still designed but not created. Everything in this document about that split remains accurate.

---

## 0. What This Document Is

The operational ground rules for building Zimplixio CRM v2: the git branch model, the Railway environments, which branch deploys where, and the database discipline. It exists to fix two specific V1 failures:

1. **A single `main`/master branch managing everything** — no separation between in-progress work and live code.
2. **A single database for everything** — development changes and production data sharing one store.

V2 separates both, deliberately.

---

## 1. Git Branch Model

Two long-lived branches, already created:

- **`main`** — reflects production. Stable. Nothing is committed directly to it; it only receives tested work from `development` at release time.
- **`development`** — the working/integration branch. All V2 build work happens here (directly or via short-lived feature branches merged into it).

**Standing rule:** during the V2 build, Claude Code works on **`development`**. `main` is not touched until the owner explicitly instructs a production release.

Optional (recommended as work grows): short-lived **`feature/*`** branches off `development`, merged back into `development` — keeps `development` clean for larger units of work. Not required while the build is early and single-threaded.

**Housekeeping:** stray/working branches (e.g. old `claude/*` branches) are merged or deleted, not left to linger. Branch clutter was part of V1's accretion; V2 keeps the branch list tidy.

---

## 2. Railway Environments

Railway's native **environments** feature is used (industry-standard on Railway; isolates services, variables, and databases per environment under one project).

### 2.1 Standing State — `development` (LIVE)

Already stood up and running:

| Item | Value |
|---|---|
| **Project** | Zimplixio CRM |
| **Environment** | `development` |
| **Tracks branch** | `development` |
| **Auto-deploy** | On (push to `development` deploys automatically) |
| **Wait for CI** | Off (no CI pipeline yet — correct for now) |
| **Services** | `Postgres`, `Zimplixio_Office` (web, crm.zimplixio.com), `Worker` — all on `development` |

This is where **all V2 work happens.** The live domain `crm.zimplixio.com` currently points here; acceptable during the build because the owner is the only user.

### 2.2 Target State — `production` (DESIGNED, NOT YET PROVISIONED)

Created later, at cutover — **do not provision now:**

| Item | Value |
|---|---|
| **Environment** | `production` (new, separate Railway environment) |
| **Tracks branch** | `main` |
| **Database** | a **fresh, empty Postgres** — never a copy of dev data |
| **Created** | when V2 is solid and the owner instructs the cutover |

The promotion model is: **code + migrations move between environments; the database never does.** `development` and `production` each keep their own isolated Postgres.

---

## 3. Database Discipline

The single most important operational fix from V1.

### 3.1 Reuse the Service, Not Its Contents

The existing Postgres service (which held V1's schema — Post, PipelineRun, Opportunity, Project, Task, User, etc.) is **reused as the `development` database** to avoid re-provisioning. But V2 is a clean rebuild with a from-scratch schema, so:

> **Claude Code's first task:** wipe the dev database to a clean slate — drop all V1 tables (Post, PipelineRun, Opportunity, Project, Task, User, etc.) so V2's first migration runs against an **empty** database. There is no V1 data to preserve (owner-confirmed). Reuse the *service*; discard the *contents*. This is a routine schema-reset for Claude Code against the dev `DATABASE_URL`; the owner does not do it by hand.

### 3.2 One Database Per Environment

- `development` environment → its own Postgres (the reused, wiped service).
- `production` environment → its own fresh Postgres (later).
- **Never shared.** Development can be broken freely with zero risk to production. This is the whole point of the separation.

### 3.3 Migration Flow

- **Now and until further notice: migrations run against `development` only.** All schema work — the generic Department model, Company Profile, Findings, and everything after — is authored and applied on the dev database.
- **Production migrations are a later, explicit step.** The owner will instruct when to run migrations against production. No automatic prod migration; no auto-deploy-driven schema changes to prod.
- Prisma is the single migration authority (`prisma migrate`). Postgres remains the single source of truth (no parallel state stores) — consistent with the planning doc.

---

## 4. The Working Loop (current phase)

While building V2:

```
edit code  ->  commit to `development`
           ->  push to GitHub
           ->  Railway `development` env auto-deploys
           ->  Prisma migrations run against dev Postgres
           ->  verify in the running dev app (crm.zimplixio.com)
```

`main` and a `production` environment stay untouched until the owner calls the cutover.

---

## 5. Cutover to Production (later — documented, not executed)

When V2 is solid, the release path will be:

1. Create a **`production`** Railway environment mapped to the **`main`** branch, with a **fresh empty Postgres**.
2. Merge tested `development` → `main`.
3. Run Prisma migrations against the production database (owner-instructed).
4. Point `crm.zimplixio.com` at the production web service; repoint any dev domain as needed.
5. From then on: work continues on `development`; `main`/production receives only tested releases.

*Details finalized when the cutover is actually scheduled.*

---

## 6. Summary — The Locked Rules

- **`main` = production, `development` = working branch.** Build on `development`; never commit to `main` directly.
- **Railway `development` environment is LIVE**, tracking `development`, auto-deploy on — all V2 work happens here.
- **Railway `production` environment is designed, not built** — created at cutover, mapped to `main`, with its own fresh empty DB.
- **Existing Postgres is reused as dev but wiped clean** before V2's first migration — this is Claude Code's first build task, not a manual owner step.
- **One DB per environment; never shared.** Code and migrations promote; databases do not.
- **Migrations are dev-only until the owner explicitly instructs a production migration.**
- Keep the branch list tidy — merge or delete stray branches.
