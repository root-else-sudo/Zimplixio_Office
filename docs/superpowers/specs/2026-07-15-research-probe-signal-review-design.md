# Research Probe — Signal Review & Guidance Design

| Field | Value |
|---|---|
| **Document Type** | Design Spec |
| **Companion To** | `2026-07-14-research-probe-data-quality-fixes-design.md` (fix pass #1, which this follows) |
| **Date Issued** | 2026-07-15 |
| **Owner** | Joe Ugalde |
| **Status** | Approved design, not yet built |

---

## 0. What This Is and Why

Fix pass #1 (2026-07-14) fixed truncation, exact-URL deduplication, and silent extract failures in the Research Probe's Gather step. It shipped, was deployed, and was live-verified: signal count dropped from 21 raw items to 12 genuinely unique ones, and zero items hit the new content cap.

The owner then reviewed that real 12-item run signal-by-signal and found two problems fix pass #1 didn't touch, both confirmed against the live database:

1. **No relevance/entity filtering on `search()` results.** The Gather step's relevance-targeting (`query`/`chunksPerSource` on `extract()`) only applies to owner-pasted URLs — `search()` results get no such filtering. Two concrete failure modes, both confirmed: (a) LinkedIn's company-jobs page content includes platform-wide job-count stats ("Engineer: 555,845 open jobs" — site-wide, not company-specific), and (b) a genuine **entity-confusion false positive** — a "Hillpointe reviews" search returned `neighborhoods.com/hillpointe-menifee-ca`, a residential neighborhood in Menifee, CA that happens to share the company's name, and `surecritic.com/apartments`, confirmed via direct database query to not mention "Hillpointe" anywhere in its content.
2. **Dedup doesn't catch same-content-different-URL duplicates.** `normalizeUrl()` only strips trailing slashes. Confirmed via byte-comparison that `http://job-boards.greenhouse.io/hillpointe` and `https://job-boards.greenhouse.io/hillpointe/jobs/5247340008` are substantially the same 40-job board content (first 500 characters of one contained verbatim in the other) but weren't deduplicated, because they differ by scheme and an appended job-id path segment that exact-URL matching can't see past.

The owner's stated guiding principle for this whole effort: *"if the raw data does not bring good signal info, the downstream process will not produce anything valuable."* This spec fixes both problems with one new pipeline step, and adds a small learning mechanism so the fix gets better across runs rather than repeating the same mistakes — mirroring a pattern already proven in the production Research Engine (`GuidanceSummary`), adapted to this POC's own isolated schema.

---

## 1. Goals and Non-Goals

**Goals:**
- Catch wrong-entity and platform-generic noise in `search()` results before it reaches Hypothesize/Test.
- Catch near-duplicate content across different URLs (not just exact-URL matches), regardless of source.
- **The "Signal gathered" section the owner reads should show exactly what Hypothesize/Test uses, nothing more.** This revises the original POC's blanket "nothing is filtered or curated away" principle: that principle was about not hiding *reasoning outcomes* from the owner (Findings, hypotheses), not about forcing the owner to manually re-filter noise the app already knows is noise. Excluded items are still persisted (§2.4) — as a durable record the Review step's own learning loop can draw on, and a debugging trail if the filter's judgment is ever in question — but never rendered on the run-detail page. No count, no badge, no mention.
- Let the fix improve over time: what gets excluded and why should generalize into guidance that improves future runs against any company, not just the one just probed. (The owner's longer-term direction: this persisted exclusion record is a first step toward the Gather step itself one day consulting known-noise patterns before making API calls, not just the Review step judging after the fact — out of scope for this pass, but why exclusions are persisted rather than discarded.)

**Non-goals (explicitly out of scope for this pass):**
- **No judgment of business relevance to Zimplixio.** This new step only asks "is this genuinely about the target company, and not a duplicate of something already kept?" — not "is this useful for pitching a service." That judgment remains Hypothesize's job entirely; this step doesn't second-guess or narrow it.
- **No company-specific memory.** Guidance is general and cross-company (per the owner's chosen direction) — no table of "for company X, URL Y was noise." A future pass could add this if repeat-probing the same company turns out to be common; not needed now.
- **No changes to `gather.ts`'s content-cap or extract-relevance-targeting logic** (fix pass #1's territory) — this pass only adds a new step after Gather, it doesn't modify Gather itself.
- **No changes to the production Research Engine or its own `GuidanceSummary`.** The new `ProbeReviewGuidance` model is a separate table — the Probe's isolation from the production schema (design doc, fix pass #1) is preserved.

---

## 2. Design

### 2.1 Review step

New module `src/lib/research-probe/review.ts`, mirroring `gather.ts`'s shape (one exported async function). One `MODELS.FAST` (Haiku) call — this is a classification task, not deep reasoning, so it doesn't need the Sonnet tier `Hypothesize`/`Test` use.

```ts
export interface ReviewedSignalItem extends ProbeSignalItemInput {
  includedInReasoning: boolean
  exclusionReason: string | null
}

export async function reviewSignal(opts: {
  companyName: string
  items: ProbeSignalItemInput[]
  guidance: string
}): Promise<ReviewedSignalItem[]>
```

The model receives the company name, the current `ProbeReviewGuidance` content (may be empty), and every gathered item indexed. It judges exactly two things per item: **(a) is this genuinely about the named company** — not a different entity that happens to share the name, not generic platform-wide content unrelated to this specific company — and **(b) is this a near-duplicate of an earlier item in the same batch** (same underlying content reached via a different URL/source). It must return one `{ index, include, reason }` entry per item it was given, in order — same "never silently drop one" discipline the existing Test stage already follows, so a bad call can be audited.

**Hard override in code, not left to the model:** for any item where `group === 'manual' || group === 'tavily_extract'`, the code forces `includedInReasoning: true, exclusionReason: null` regardless of what the model returned for that index. The model still sees these items (so it can correctly recognize when a `tavily_search` result duplicates one of them), but its verdict on them is discarded.

### 2.2 Review Guidance distillation

New singleton Prisma model per department, structurally identical to the production engine's `GuidanceSummary`:

```prisma
model ProbeReviewGuidance {
  id           String     @id @default(cuid())
  departmentId String     @unique
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  content      String     @default("")
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}
```

Runs once per probe run, **only if the Review step excluded at least one item** (mirrors the production engine's guard against distilling when nothing new happened). One more `MODELS.FAST` call, in a new function alongside `reviewSignal` (or a sibling function in the same file — implementation task decides based on resulting file size). Input: the current guidance text plus this run's excluded items (source, title, reason) — explicitly *not* company-specific framing. The system prompt instructs pattern extraction over instance-logging, mirroring the production `DISTILL_SYSTEM`'s own instruction almost verbatim: learn "LinkedIn company pages often surface platform-wide stats, not company-specific ones," not "Hillpointe's LinkedIn page was noise." Same discipline as the production Distill: **rewrite the guidance, don't append to it** — stays a bounded short paragraph or two (capped at 2,000 chars, matching the production `DistillOutputSchema`), never a growing log.

### 2.3 Pipeline order in `engine.ts`

1. Fetch Company Profile (existing, unchanged)
2. **Fetch/upsert `ProbeReviewGuidance`** (new) — `upsert` with `update: {}` so an existing row is read as-is and a first-ever run creates an empty one, exactly matching how `GuidanceSummary` is fetched in the production engine
3. Gather (existing, unchanged — fix pass #1's logic)
4. **Review** (new) — annotate every gathered item using the guidance fetched in step 2
5. **Distill** (new, conditional) — if step 4 excluded anything, rewrite `ProbeReviewGuidance.content` for future runs
6. Persist **all** items (everything from step 4, both included and excluded) plus any extract failures (fix pass #1's existing logic, unchanged) — nothing gathered disappears from what's stored or shown
7. Hypothesize/Test — fed only the subset where `includedInReasoning === true`. **New failure mode:** if that subset is empty (everything gathered was judged noise), the run ends `FAILED` with a distinct message — `"All gathered signal was excluded as noise — nothing to reason about"` — so this is visually distinguishable in the UI from the existing "No signal gathered" message (which means Gather itself returned nothing, a different problem).

### 2.4 Data model: `ProbeSignalItem` additions

Two new fields, not a new enum value — this is orthogonal to `source` (which describes *how* an item was gathered, not whether it's noise):

```prisma
includedInReasoning Boolean @default(true)
exclusionReason     String?
```

`Department` gains one new relation field: `probeReviewGuidance ProbeReviewGuidance?` (mirrors its existing `guidanceSummary GuidanceSummary?` relation).

### 2.5 UI

The "Signal gathered" section is filtered to `includedInReasoning === true` items only — same query, same fetch, but the array rendered on the page excludes anything the Review step marked noise. The header stays exactly as it was before this pass, `"Signal gathered (N)"` — no second count, no sub-label — because `N` now *is* the reasoning count by construction, not a subset of a larger visible list. No badge, no indication filtering happened at all. `EXTRACT_FAILED` items are unaffected by this — that's a distinct case (an operational fetch failure the owner may want to act on, e.g. by trying a different URL) and keeps its own visible "Extraction issues" section from fix pass #1, unchanged.

Excluded-as-noise items are still written to the database (§2.4) with `includedInReasoning: false` and a populated `exclusionReason` — readable via a direct database query if the owner ever wants to audit a specific run's filtering decisions, but never surfaced in the app UI.

---

## 3. Files Touched

- `src/lib/research-probe/review.ts` — **new file**: `reviewSignal()` and the guidance-distillation function
- `src/lib/research-probe/prompts.ts` — new `PROBE_REVIEW_SYSTEM`, `probeReviewUserMessage()`, `PROBE_REVIEW_DISTILL_SYSTEM`, `probeReviewDistillUserMessage()`
- `src/lib/research-probe/schemas.ts` — new `ProbeSignalReviewOutputSchema`/`PROBE_REVIEW_TOOL`, `ProbeReviewDistillOutputSchema`/`PROBE_REVIEW_DISTILL_TOOL`
- `src/lib/research-probe/engine.ts` — insert the new pipeline steps (§2.3), update persistence to include the two new fields, add the new empty-after-review failure branch
- `prisma/schema.prisma` — new `ProbeReviewGuidance` model, two new fields on `ProbeSignalItem`, one new relation field on `Department`; new migration
- `src/app/(dashboard)/departments/product-research/workflow/[runId]/page.tsx` — the two UI changes in §2.5

No changes to `src/lib/research-probe/gather.ts`, `src/lib/research/` (production engine), or `WorkflowTriggerForm.tsx`.

---

## 4. Validation

Once built, re-run against Hillpointe using the same no-manual-URL run shape that surfaced these findings, and confirm:
- The LinkedIn item, the Menifee neighborhoods.com item, and the SureCritic item are all marked `includedInReasoning: false` with a reason referencing entity mismatch or lack of company-specific content.
- Of the two near-duplicate Greenhouse job-board items, exactly one is excluded, with a reason referencing duplication of the other.
- The Jax Daily Record news article (genuine business-scale signal — a $190M fund close, unit counts) and the SimplyHired/Lensa salary data remain included — the Review step should not be over-aggressive against genuinely relevant, non-duplicate content.
- `ProbeReviewGuidance.content` is non-empty after this run and reads as general pattern language, not a restatement of "Hillpointe's X was excluded."
- A second run (any company) shows the Review step's prompt actually includes the guidance text from the first run.
- On the run-detail page, the excluded items above are **not visible anywhere** — confirm by comparing the page's rendered item count against a direct database count of `includedInReasoning = true` rows for that run; they must match exactly, with zero mention of the excluded ones.
