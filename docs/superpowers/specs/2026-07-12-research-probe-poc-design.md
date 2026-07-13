# Research Probe — Proof of Concept Design

| Field | Value |
|---|---|
| **Document Type** | Design Spec (POC) |
| **Companion To** | `2026-07-03-crm-v2-planning.md` §2.3 (Research Engine) |
| **Date Issued** | 2026-07-12 |
| **Owner** | Joe Ugalde |
| **Status** | Approved design, not yet built |

---

## 0. What This Is and Why

The existing, scheduled Research Engine (`src/lib/research/`) proposes candidate Findings from broad, generic web signal ("biggest problems small business owners are facing"). Reviewing real output, the owner identified that this produces things any experienced person in the industry already knows — not novel, not worth the API spend. Root cause, confirmed by reading the actual code: the Gather step asks for *stated* pain (surveys, generic articles that already state the conclusion) instead of *revealed* pain (things a business leaks about itself without saying so out loud — job-posting language, employee-review patterns, turnover cadence). Separately, the engine keeps none of what it gathers or reasons through — every run starts from zero, with no durable record for the owner to inspect, correct, or learn from.

This spec is **not** a redesign of that engine. It's a small, fully isolated proof of concept to test one specific question before any bigger investment: **given a named company, can targeted "revealed pain" signal plus a two-pass reasoning pipeline produce a genuinely sharp, defensible service-opportunity — comparable to what the owner produced by hand — without the owner doing the per-company legwork themselves?**

**Origin case:** a real property management company (Hillpointe, discovered via a personal circumstance — a condo where the owner lives, managed by Hillpointe, that lost a leasing manager, her assistant, and three subsequent hires within ~10 weeks). Manually investigating Hillpointe's job postings and employee reviews surfaced concrete, specific signal: named tools (Entrata, RealPage, Clockify), a broad always-on multi-hat role with a low entry bar, a dedicated "Floating Leasing Specialist" role covering for turnover across multiple properties, and employee reviews describing a July 2025 leadership shakeup and staff feeling "treated as numbers." That manual pass is the bar this POC needs to clear automatically, for companies the owner *hasn't* personally investigated.

**Validation plan (§7) is part of this spec, not an afterthought:** first re-run against Hillpointe (a known answer, to sanity-check reasoning quality), then against a handful of companies the owner picks by hand but hasn't personally researched (the real test — does it work without the owner's own legwork).

---

## 1. Goals and Non-Goals

**Goals:**
- Given a company name (plus optional manually-pasted signal), gather targeted signal about that specific company and produce reasoned, evidenced opportunity hypotheses.
- Persist every step's actual output — every signal item, every hypothesis proposed (including ones that don't survive), every piece of Test-stage reasoning — so the owner can inspect the real work, not just a final answer.
- Give the owner a UI (new "Workflow" tab) to trigger a run and see everything it did.

**Non-goals (explicitly out of scope for this POC):**
- **No changes to the existing Research Engine, Findings tab, Company Profile, or Guidance Summary.** Zero shared schema or pipeline code — this is a fully separate, parallel path. (Generic infra — the Claude client wrapper, the Tavily client — is shared; the *pipeline logic and data model* are not.)
- **No scheduling/cron.** On-demand only, triggered by the owner typing in a company name.
- **No Finding lifecycle** (candidate/validate/reject). This POC's output is a persisted record the owner reads directly in the Workflow tab — it does not feed the existing Findings review queue.
- **No automated candidate-company discovery** (e.g., scraping a business registry or job board at scale to generate a list of company names). The owner supplies the company name by hand for every run. If the POC's reasoning proves out, automated discovery is a separate, later initiative.
- **No live/streaming progress.** A run executes synchronously within one HTTP request; the UI shows a loading state, then the full result once it completes. Given Railway (not a serverless platform with hard execution-time limits), a run taking up to ~60 seconds end-to-end is acceptable.

---

## 2. Architecture

New, fully separate module: `src/lib/research-probe/` (mirrors the shape of `src/lib/research/` but shares no pipeline code with it — `gather.ts`, `prompts.ts`, `schemas.ts`, `engine.ts`). Reused as generic infrastructure, not pipeline logic: `callClaude`/`MODELS` from `src/lib/ai-client.ts`, the `@tavily/core` client pattern from `src/lib/research/tavily.ts` (same lazy-singleton style, new gather function).

Execution model: **synchronous, on-demand, no pg-boss/Worker involvement.** A single API route runs Gather → Hypothesize → Test end-to-end within one request and writes the full result to Postgres before responding. No job queue, no scheduling infrastructure — this POC is testing reasoning quality, not operational resilience, and adding queue/polling machinery to test that would be solving a problem this POC doesn't have.

Rate limiting: this route triggers paid Claude + Tavily calls, so it gets the same `rateLimit()` mechanism as `POST /api/research/run` (Postgres-backed, existing `src/lib/ratelimit.ts`) — but a shorter window (1 run per 2 minutes, vs. the production route's 1-per-5-minutes), since this POC's actual usage pattern is testing several different companies back-to-back in one sitting (per §8's validation plan), not a single weekly-cadence trigger.

---

## 3. Data Model

Three new Prisma models, named `Probe*` to be honest about their POC status (not reusing or extending `Finding`/`Department` anatomy tables):

```prisma
model ProbeRun {
  id           String          @id @default(cuid())
  departmentId String
  department   Department      @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  companyName  String
  manualNotes  String?         // freeform text the owner pastes in (e.g. observed context, job posting text)
  status       ProbeRunStatus  @default(RUNNING)
  errorMessage String?
  costUsd      Float?
  createdAt    DateTime        @default(now())
  completedAt  DateTime?

  signalItems  ProbeSignalItem[]
  hypotheses   ProbeHypothesis[]
}

enum ProbeRunStatus {
  RUNNING
  COMPLETE
  FAILED
}

model ProbeSignalItem {
  id        String            @id @default(cuid())
  runId     String
  run       ProbeRun          @relation(fields: [runId], references: [id], onDelete: Cascade)
  source    ProbeSignalSource
  title     String?
  url       String?
  content   String
  createdAt DateTime          @default(now())
}

enum ProbeSignalSource {
  MANUAL          // pasted directly by the owner
  TAVILY_SEARCH   // from a targeted search() call
  TAVILY_EXTRACT  // from a direct extract() call against an owner-supplied URL
}

model ProbeHypothesis {
  id                    String           @id @default(cuid())
  runId                 String
  run                   ProbeRun         @relation(fields: [runId], references: [id], onDelete: Cascade)
  need                  String
  proposedService       String
  basedOnSignal         String[]         // short quotes/paraphrases of the signal it's grounded in
  title                 String?          // filled in by the Test stage
  evidence              String?
  fitRationale          String?
  confidence            ProbeConfidence?
  disconfirmingEvidence String?
  createdAt             DateTime         @default(now())
}

enum ProbeConfidence {
  LOW
  MEDIUM
  HIGH
}
```

Deliberately one `ProbeHypothesis` model, not two (Hypothesize output vs. Test output) — the Test stage fills in the nullable fields on the same row. This avoids an unnecessary join for what's fundamentally one entity moving through two stages. **Every hypothesis is kept, survivor or not** — there's no deterministic filtering/capping step like the production engine's Queue stage, because the entire point is showing the owner everything, not curating it down to a shortlist.

`Department` gets a new back-relation: `probeRuns ProbeRun[]`.

---

## 4. Gather

Given `companyName` (required) and optional `manualNotes` (freeform text) and optional `urls` (a list the owner supplies, e.g. a specific job posting link):

1. Any `manualNotes` text becomes one `ProbeSignalItem` with `source: MANUAL`.
2. Any supplied `urls` are fetched via Tavily's `extract()` (confirmed working directly against Indeed search-result pages and company pages during this design's research — see §0) — each becomes a `ProbeSignalItem` with `source: TAVILY_EXTRACT`.
3. A small set of targeted `search()` calls run against the company name — e.g. `"<companyName> jobs"`, `"<companyName> careers"`, `"<companyName> reviews"` — each result becomes a `ProbeSignalItem` with `source: TAVILY_SEARCH`. (Exact query templates are an implementation detail for the plan, not re-litigated here — the principle is *targeted at one named company*, not the production engine's generic market-wide queries.)

All signal items for the run are collected before Hypothesize runs, same ordering as the production engine's Ground→Gather boundary.

---

## 5. Hypothesize + Test

Same two-pass shape as the production engine (a proposal pass, then a skeptical evaluation pass), but with **new, company-specific prompts** (not the existing `HYPOTHESIZE_SYSTEM`/`TEST_SYSTEM` from `src/lib/research/prompts.ts`, which are written for broad-market reasoning across many companies). The probe's prompts reason about **one named company** using **all its gathered signal** (manual + searched + extracted), still grounded in the existing Company Profile (what Zimplixio can credibly offer) so `fitRationale` stays honest, per the existing schema shape (`need`, `proposedService`, `basedOnSignal` → then `title`, `evidence`, `fitRationale`, `confidence`, `disconfirmingEvidence`). No Guidance Summary input — this POC doesn't have a learning loop; it's a single-shot probe per company, not an ongoing improving cycle.

Both calls use the existing Zod-validate-before-write discipline already established in the production engine — malformed model output aborts the run (`status: FAILED`, `errorMessage` set) rather than writing partial garbage.

---

## 6. UI — the Workflow Tab

New tab in `ProductResearchTabs.tsx`: **Workflow**, alongside the existing Overview / Company Profile / Guidance Summary / Findings tabs (none of which change).

- **`/departments/product-research/workflow`** — a trigger form (company name, optional notes textarea, optional URLs) plus a list of past runs (company name, status, date) to select from.
- **`/departments/product-research/workflow/[runId]`** — the full detail of one run: every signal item gathered (grouped by source), every hypothesis proposed, and every tested result with its full reasoning — confidence, evidence, disconfirming evidence — shown for **all** of them, not just high-confidence ones. This is the actual point of the POC: seeing the real work, not a curated final answer.

Standard architecture pattern applies: server components fetch via Prisma, the trigger form is a client component that calls a new API route.

---

## 7. API

**`POST /api/research-probe/run`** — `withAuth`-wrapped, rate-limited (1/2min), body `{ companyName: string, manualNotes?: string, urls?: string[] }`. Creates a `ProbeRun` (`RUNNING`), executes Gather → Hypothesize → Test synchronously, writes all `ProbeSignalItem`/`ProbeHypothesis` rows, marks the run `COMPLETE` (or `FAILED` with `errorMessage` on any unrecoverable error), and returns the run's id so the client can navigate to its detail page.

---

## 8. Validation Plan

1. Re-run against **Hillpointe** (`manualNotes` can include the condo turnover context and pasted job-posting text already gathered by hand this session) — sanity-check that the automated pass produces reasoning at least as sharp as the manual pass already done, given the same starting material.
2. Run against **a handful of companies the owner picks but hasn't personally researched** — the real test. Success looks like: specific, evidenced, defensible hypotheses tied to something concrete (a named tool, a role-overload pattern, a review-revealed instability) — not generic "SMBs need automation" mush.
3. If step 2 fails to clear that bar, the finding is: automating this needs more/different signal sources or better prompts before it's worth building further on top of — a legitimate, useful outcome of the POC, not a failure of process.

---

## 9. What Happens After

Not decided here, deliberately — the whole point of a POC is to look at real results before committing further. If it works: candidate next steps include automated company-name discovery (job-board-derived employer names, not a business registry — see the discovery-source discussion this design came out of), and/or graduating some part of this into the production Research Engine. If it doesn't: the `Probe*` tables and the Workflow tab are cheap to remove or leave dormant — nothing about the production engine, Findings, or existing department pages depends on them.
