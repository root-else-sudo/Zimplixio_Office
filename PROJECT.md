# Zimplixio Office — Project State

## Purpose
Web dashboard for reviewing and publishing AI-generated LinkedIn posts, monitoring pipeline runs, and discovering business opportunities. Runs locally at `http://localhost:3000`.

---

## Pages

| Route | Server File | Client File | Description |
|---|---|---|---|
| `/` | `(dashboard)/page.tsx` | `OverviewClient.tsx` | KPI stats, agents strip with modal, charts |
| `/posts` | `(dashboard)/posts/page.tsx` | `PostsClient.tsx` | Draft/approved post review and approval |
| `/agents` | `(dashboard)/agents/page.tsx` | — | Pipeline Flow visualization (full page) |
| `/opportunities` | `(dashboard)/opportunities/page.tsx` | `OpportunitiesClient.tsx` | AI-generated SMB opportunities |
| `/calendar` | `(dashboard)/calendar/page.tsx` | — | Placeholder (not yet implemented) |
| `/login` | `(auth)/login/page.tsx` | — | Credentials + MFA login |

---

## Components

| Component | File | Purpose |
|---|---|---|
| Sidebar | `src/components/Sidebar.tsx` | Navigation groups, user info, push notification toggle, sign-out |
| PipelineFlow | `src/components/PipelineFlow.tsx` | 7-node animated pipeline visualization with live polling, hover tooltips, detail panel, run selector |

### Sidebar Navigation Structure
```
Marketing:
  Overview       /
  Posts          /posts
  Pipeline       /agents
  Calendar       /calendar
Sales:
  Opportunities  /opportunities
  More coming    (disabled)
```

---

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/pipeline` | POST | Admin only | Triggers pipeline, returns `{ runId }` |
| `/api/pipeline/[runId]` | GET | Any user | Polls run status, postCount, log |
| `/api/posts/[id]` | PATCH | Any user | Update post status (APPROVED / REJECTED / PUBLISHED) |
| `/api/opportunities` | GET | Any user | Returns all opportunities ordered by generatedAt desc |
| `/api/opportunities` | POST | Admin only | Runs `opportunities_find.py`, inserts 5 new opportunities, returns them |
| `/api/stats` | GET | Any user | Returns current `{ totalDrafts, totalApproved }` |
| `/api/notifications/subscribe` | POST | Any user | Saves browser push subscription |
| `/api/auth/[...nextauth]` | * | — | NextAuth handlers |
| `/api/mfa/*` | * | — | TOTP MFA setup and verification |

---

## Database Models

| Model | Key Fields | Notes |
|---|---|---|
| `User` | id, name, email, passwordHash, role, mfaEnabled, mfaSecret | Roles: ADMIN, REVIEWER |
| `Agent` | id, name, description, cronSchedule, scriptPath, isActive | One agent: "LinkedIn Posts" |
| `PipelineRun` | id, agentId, status, startedAt, finishedAt, log | Statuses: RUNNING, SUCCESS, FAILED |
| `Post` | id, runId, newsletter, sourceSubject, sourceDate, content, status | Statuses: DRAFT, APPROVED, REJECTED, PUBLISHED |
| `Opportunity` | id, title, sector, signal, zimplixioAngle, actions (JSON), generatedAt | 5 per generation, history kept |
| `Notification` | id, userId, type, message, read | In-app notification store |
| `PushSubscription` | id, userId, endpoint, p256dh, auth | Browser push VAPID subscriptions |

---

## Design System (`src/app/globals.css`)

| Class | Description |
|---|---|
| `.soft-card` | White card, 20px border-radius, subtle shadow |
| `.dark-card` | Dark navy card (`#1a1f36`) — used for Recharts panels |
| `.stat-chip` | KPI tile — white card with padding |
| `.badge` | Small inline pill label |
| `.eyebrow` | Tiny uppercase section label (indigo, wide letter-spacing) |
| `.btn-primary` | Indigo filled button with flex icon support |
| `.btn-outline` | Indigo outline button |
| `.status-dot` | 8px colored circle for agent status |
| `.flow-dot` | Animated connector dot in PipelineFlow (`@keyframes flowDot`) |
| `@keyframes nodeEnter` | Staggered entrance animation for PipelineFlow nodes |

Background: `#f0f2f8` (blue-tinted light gray). Primary accent: indigo (`#6366f1`).

---

## Notification System

| Channel | Implementation | Trigger |
|---|---|---|
| WhatsApp | Twilio sandbox → `WHATSAPP_NOTIFY_TO` | After every pipeline run (success or fail) |
| Browser push | Web Push / VAPID | After every pipeline run (success or fail) |

WhatsApp FROM must be `whatsapp:+14155238886` (Twilio sandbox). Recipient must have opted in via WhatsApp "join [keyword]".

---

## Connection to Zimplixio_Marketing

The `/api/pipeline` route uses `child_process.exec` to run Python scripts from `MARKETING_DIR`. After all scripts complete, it reads `tmp/posts_draft.json` and ingests posts into the `Post` table. The `/api/opportunities` POST route runs `opportunities_find.py` and reads `tmp/opportunities.json`.

Pipeline script execution order is defined in `MARKETING_DIR/pipeline.config.json` — the single source of truth. The API route reads this file dynamically at runtime, so adding or reordering scripts in that config file is all that's needed; no code changes required in this project.

---

## Open Items
- Calendar page not yet implemented
- LinkedIn publishing flow not yet implemented (posts are approved in-app but publishing requires manual action)
- WhatsApp: Twilio sandbox has a recipient opt-in requirement; production upgrade would remove this
