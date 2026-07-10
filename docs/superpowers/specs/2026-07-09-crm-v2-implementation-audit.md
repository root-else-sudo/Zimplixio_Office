# CRM v2 Implementation Audit — Planning Docs vs. Reality

**Date:** 2026-07-09
**Trigger:** Owner feedback that Increments 1–5 felt "way basic" relative to the planning effort, sharpened by directly catching that MFA (explicitly specified) was non-functional. Owner asked for a full adversarial audit of all four planning docs against the live app, database, and code — "the gap list will come by the dozens."

**Method:** Five independent adversarial subagents, each auditing one document or the code itself against actual evidence (code, live HTTP responses to `crm.zimplixio.com`, local + Railway Postgres queries, git history) — not against my own self-report. This document consolidates their findings, resolves one direct contradiction between two of them, and prioritizes everything for action.

---

## Read this part first

### 1. Your live production admin account is `admin@zimplixio.com` / `changeme123`, right now, with MFA off and no login rate limiting

This is the single most urgent item in this whole report, independent of everything else. `prisma/seed.ts:136` falls back to the literal string `changeme123` when `SEED_PASSWORD` isn't set in the environment, and the security audit confirmed live that this password works against production, MFA is disabled, and there is zero rate limiting on `/api/auth/callback/credentials` (4 consecutive bad passwords, no throttling, no lockout). This should be fixed today: rotate the password, confirm `SEED_PASSWORD` is set to a real value in Railway, and either enable MFA for the account or add login rate limiting (ideally both).

### 2. The security-audit subagent touched production in ways worth knowing about

While verifying the security doc, that subagent (with the harness's own automated flag on its output): read the raw `mfaSecret` column from the live `User` table, created a real test `Finding` row on production and then deleted it, and ran several live login attempts against `crm.zimplixio.com` — including one **successful** login using the real seed credentials, to prove the password-guessability finding. This was in service of the audit you asked for and it cleaned up after itself (test row deleted, no data corrupted), but it's a live-production action you didn't specifically pre-authorize at that level of detail, so I'm surfacing it rather than letting it pass silently. Nothing appears to have been left in a bad state, but you may want to rotate the admin password regardless (see #1), which moots any residual exposure.

---

## Bottom line

| Audit | Result |
|---|---|
| Planning doc (`2026-07-03-crm-v2-planning.md`) | 17 done / 5 partial / 0 absent |
| Design System (`2026-07-03-crm-v2-design-system.md`) | 16 done / 7 partial / 5 not done (of ~28) |
| Environments & Git Workflow (`2026-07-05-...`) | 8 confirmed / 3 partial / 1 contradicted / 5 unverifiable-from-repo |
| Security (`2026-07-05-crm-v2-security.md`) | 6 done / 8 partial-or-inactive / 3 not built / 2 unverifiable (of ~19) |
| Code-quality review (architecture/correctness) | 0 critical / 3 important / 4 minor |

Nothing was found to be structurally missing at the architecture level — the six-department/shared-anatomy pattern, the Research Engine's five-stage loop, and the server/client boundary are all faithfully built. The gaps are concentrated in **half-finished features that look done from the outside** (MFA, CSP, review-queue rows, Goals/Tasks) and **specified requirements that were simply never started** (recovery codes, audit log, toast system).

---

## Critical — fix before anything else

1. **Production admin credentials are guessable, MFA is off, login has no rate limiting.** See above. This is the one item that shouldn't wait for prioritization discussion.
2. **MFA's authorization boundary doesn't reach the API layer.** `src/lib/rbac.ts`'s `withAuth()` only checks `session?.user?.id` — it never checks `session.user.mfaVerified`. The page-level redirect in `src/proxy.ts` protects pages, but its matcher excludes `/api/*`. Once MFA is turned on, a password-only session can still call every mutating route directly, including Finding approval (the human-approval boundary the whole Research Engine design depends on) and `research/run` (the route that spends real money). Verified live: logged in with MFA off, `POST /api/findings` → `201 Created`. **This needs fixing at the same time MFA is re-enabled for the account**, not after — otherwise re-enrollment gives a false sense of security.
3. **Content-Security-Policy ships in report-only mode with no reporting endpoint configured.** It's visibly present in every response header, blocks nothing, and isn't even collecting the violations it's supposedly monitoring. `next.config.ts`'s own comment says this was meant to be temporary ("switch once telemetry is clean") — that follow-up never happened.

## Important — real, demonstrated bugs

4. **Login page's "Sign In" button is completely unstyled.** `src/app/(auth)/login/page.tsx:93` uses `btn-primary-brand`, a class that doesn't exist anywhere in the codebase or the compiled CSS. Confirmed in the production CSS bundle. This is the first thing anyone sees.
5. **Sidebar's active-nav indicator is broken on 3 of Product/Research's 4 tabs.** `src/components/Sidebar.tsx:75` uses exact match (`pathname === href`) instead of `startsWith`, so the highlight only survives on the exact overview URL — Findings, Company Profile, and Guidance Summary all show an unhighlighted sidebar. Confirmed live. (Note: the equivalent tab-bar component, `ProductResearchTabs.tsx`, already does this correctly with `startsWith` — the bug is isolated to `Sidebar.tsx`.)
6. **10 real, reviewed Findings from production — including 2 substantive rejection reasons — were permanently orphaned from the Guidance Summary, and it's not the bug it first looked like.** Full explanation below (§ "The Guidance Summary mystery, resolved").
7. **Indigo persists in the MFA auth flow** (`verify-mfa/page.tsx`, `setup-mfa/page.tsx` — 8 occurrences of `bg-indigo-*`/`text-indigo-*`/`focus:ring-indigo-*`), directly contradicting the design doc's explicit "no indigo anywhere" rule.
8. **Recovery codes are 0% built.** No schema model, no code, `grep` returns nothing — despite the security doc naming this as closing "the one gap in the V1 flow," as a locked requirement.
9. **The audit log table is 0% built.** No `AuditLog` model, no code — every login, failed login, MFA event, and Finding approve/reject is currently unrecorded, despite being a named, locked §8 requirement.
10. **`console.error` in `src/lib/errors.ts:49` bypasses pino's secret redaction.** Every unhandled route error gets dumped raw to stdout; if an Anthropic/Twilio/Tavily SDK error object carries request config (common in axios-based SDKs), a key could reach logs in the clear. Not proven to have leaked anything yet, but the control the security doc asks for isn't actually enforced on this path.
11. **Login has zero rate limiting** (confirmed live with 4 consecutive bad-password attempts, no throttling) — the sibling MFA-verify endpoint 20 lines away does this correctly, login doesn't.

## Partial — features that look done but aren't

12. **Goals and Tasks are schema-only.** Zero rows in either database, and there is no API route or UI anywhere to create one. `DepartmentAnatomy.tsx` renders a permanent "No goals yet"/"No tasks yet" — this isn't "basic but present," it's a dead end.
13. **The five reserved departments' seeded Knowledge/KPI content is invisible in the UI.** `src/app/(dashboard)/departments/[key]/page.tsx` returns `<ReservedState>` for any `RESERVED` department, completely bypassing `DepartmentAnatomy` — the seeded content exists in the DB but is never rendered anywhere. Confirmed live on `/departments/engineering`. Directly contradicts the planning doc's "seeded rather than empty" framing for reserved seats.
14. **Review-queue Finding rows are missing the status pill and evidence/source count** the design doc specifies, and have no hover treatment at all (unlike the already-resolved rows elsewhere on the same page).
15. **No toast/snackbar system exists.** All feedback is inline text under a button; the design doc describes a toast component with its own motion spec.
16. **Semantic `--success`/`--warning` tokens are dead code** — "Saved." confirmations use brand green instead, which the design doc explicitly says should stay visually distinct from system feedback.
17. **`prefers-reduced-motion` is never referenced anywhere**, despite being an explicit accessibility carry-over requirement.
18. **Gather is narrower than the doc's "cast wide" framing** — 5 fixed Tavily queries, no dedicated social/creator-signal source. Consistent with the build order's own "easy sources first" note for this increment, but worth widening in a future pass.
19. **No top bar / app-shell header exists** — each page renders its own inline header instead of a persistent shell element the design doc's diagram implies.
20. **No ghost/tertiary button variant exists**, and "Run now" uses `btn-outline` where the design doc names it as the primary-button example.

## Repo/process hygiene

21. **`main` only exists as a local git branch — it was never pushed to GitHub.** `git ls-remote origin` shows only `development`. When cutover eventually maps a `production` Railway environment to `main`, that push has to happen first — flagging now, not at cutover time.
22. **A stray branch (`claude/jovial-swartz-c027ce`, ~10 weeks old) was never cleaned up.** It's already merged into both `main` and `development`, so deleting it is safe and lossless.
23. **`npm audit` currently reports 5 moderate vulnerabilities** (via `@hono/node-server`/`@prisma/dev` and a bundled `postcss` inside `next`), and there is no CI at all — no `.github/workflows`, nothing runs `npm audit`/lint/`tsc` automatically on push.
24. **Migrations are a manual step, not an automated release action** — `docs/RAILWAY.md` already documents this correctly, but it's worth knowing the environments doc's "deploy → migrations run" diagram reads as more automated than what's actually built.
25. **CLAUDE.md had drifted stale in this session's injected context** (the version loaded described "no implementation has started," while the actual on-disk file already claimed all 5 increments complete). Not a code gap — a reminder that the on-disk file and git history are ground truth, not whatever got loaded into context.

---

## The Guidance Summary mystery, resolved

The planning-doc audit found something alarming: Railway's `GuidanceSummary` row has `updatedAt = 2026-07-09 10:37:42`, **after** all 10 real Finding reviews (09:42–10:28) that day, yet its `content` is empty — meaning those 10 reviews, including 2 substantive rejection reasons, will never be distilled. The code-quality review independently flagged a plausible mechanical cause: `engine.ts`'s Ground step does `prisma.guidanceSummary.upsert({ update: {}, ... })` and then uses the *returned* `updatedAt` as the watermark — if Prisma bumps `updatedAt` even on a no-op update, the watermark would reset to "now" on every single run, permanently disabling distillation.

I tested that mechanism directly against the local database: **`upsert({ update: {} })` on an already-existing row does not bump `updatedAt`** — confirmed empirically, not inferred. So the code-quality review's Important #1 is a false alarm as an *ongoing* bug — it's not silently breaking every future run.

What actually happened, reconstructed from the data: `GuidanceSummary.createdAt` exactly equals its `updatedAt` (10:37:42.337) — this row was **created fresh**, not updated, at that exact moment. That's the timestamp Increment 5's migration + seed were deployed and run against Railway. The 10 Findings in question were reviewed earlier that same day, using Increment 3/4 code — **before the `GuidanceSummary` table existed at all.** So this isn't an ongoing mechanism failure; it's a one-time cutover gap: a watermark mechanism was introduced into a system that already had historical data predating it, and the seed created the watermark as empty/fresh rather than backfilling from that history. Going forward, any Finding reviewed after 10:37:42 will be picked up correctly by the next run.

**The real, remaining problem:** those specific 10 reviews — including "stop proposing staffing problems" and "stop fabricating leads, be concrete" — are real, valuable signal that is currently sitting nowhere. Recommend a one-time manual backfill: run the same distill prompt by hand against those 10 titles/reasons and save the result via the Guidance Summary editor, so that signal isn't lost. I can do this in a few minutes once you confirm you want it.

---

## What's genuinely solid (worth knowing, not just gaps)

- The architecture pattern (generic `Department` + shared anatomy + per-department extensions) is a clean, faithful build of the agreed design — no leakage, no shortcuts.
- V1 removal was thorough: no orphaned tables, routes, or dead imports found anywhere.
- Prompt-injection containment is real: untrusted Tavily content is fenced and explicitly framed as data, and the model can never produce more than a `CANDIDATE` Finding — a human always has to act.
- Rate limiting, CSRF same-origin checks, and Zod validation on every mutating route are correctly implemented (with the specific login/API-MFA exceptions above).
- Secrets hygiene (gitleaks pre-commit hook, no `NEXT_PUBLIC_*` keys, no hardcoded keys) is genuinely working, confirmed via `grep` and a live hook check.
- Cookie/session handling, HSTS, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` are all correctly set and verified live.
- `tsc --noEmit` is clean at HEAD across all five audits.

---

## Suggested fix order

1. Rotate the production password / confirm `SEED_PASSWORD` in Railway; re-enroll MFA for the admin account.
2. Wire `mfaVerified` into `withAuth()` so the API layer enforces MFA, not just pages.
3. Fix the two confirmed live bugs: `btn-primary-brand` (login button) and the Sidebar active-nav match.
4. Switch CSP from report-only to enforced (or add a report endpoint first if you want a telemetry window).
5. Manually backfill the Guidance Summary from the 10 orphaned production reviews.
6. Remove indigo from the two MFA pages.
7. Decide scope/timing on recovery codes and the audit log table — both are locked security requirements but orthogonal to the 5-increment build order; worth an explicit decision on when these land.
8. Everything else (Goals/Tasks creation UI, reserved-department Knowledge/KPI display, review-queue pill/evidence count, toast system, repo hygiene) — your call on sequencing once the above is clear.
