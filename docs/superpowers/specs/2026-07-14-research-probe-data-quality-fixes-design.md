# Research Probe — Data Quality Fixes Design

| Field | Value |
|---|---|
| **Document Type** | Design Spec |
| **Companion To** | `2026-07-12-research-probe-poc-design.md` (the POC this hardens) |
| **Date Issued** | 2026-07-14 |
| **Owner** | Joe Ugalde |
| **Status** | Approved design, not yet built |

---

## 0. What This Is and Why

The Research Probe POC (built 2026-07-12/13) has now been run twice against Hillpointe and manually reviewed signal-item by signal-item in the Workflow tab. That review surfaced six concrete, evidence-backed data-quality problems in the Gather step — all tracing back to one root cause: `src/lib/research-probe/gather.ts` has no content-relevance, deduplication, or failure-visibility logic at any stage. Everything Tavily returns is truncated at a single flat length and pushed into the signal list verbatim, with no check for whether it's boilerplate, a duplicate of something already gathered, or a fetch that silently failed.

This matters because the Probe's entire premise (per the original design doc) is that targeted, revealed-pain signal produces sharper hypotheses than the production Research Engine's generic market-wide queries. If the signal feeding Hypothesize/Test is mostly cookie banners, truncated job postings, and the same page counted three times, that premise is undermined at the source — no amount of prompt engineering downstream fixes bad input.

**Evidence, gathered by directly querying the Railway `development` database and live-testing the Tavily API against both stored Hillpointe runs:**

1. **Flat 1,500-char cap (`MAX_CONTENT_CHARS`) truncates two different ways.** On boilerplate-heavy pages (e.g. `hillpointe.com/careers/` fetched via `extract()`), the entire 1,500-char window is cookie-consent text and global nav — the real content (employee testimonials, open positions) never appears; live-tested, the full page is 16,235 characters. On content-dense pages (e.g. a Greenhouse job posting), real content starts immediately but still gets cut roughly 70% short, losing the most specific details — including a named tool ("Entrata") in one case and a new-market signal (Pensacola, FL) in another. Confirmed systemic, not a one-off: across both stored runs, 24 of 36 `TAVILY_SEARCH` items (67%) and 2 of 3 `TAVILY_EXTRACT` items hit the cap exactly.
2. **No deduplication by URL.** The three fixed search queries (`"<company> jobs"`, `"<company> careers"`, `"<company> reviews"`) each independently call `search()`, and Tavily's index naturally returns the same top-ranked pages for more than one of them. `gather.ts` pushes every result from every query with no URL check. Confirmed in the database: both stored runs each have 5 URLs stored 2–3 times, meaning roughly a third of each run's "signal items" were re-fetches of a page already gathered.
3. **The duplication reaches the LLM prompt, not just the database.** `prompts.ts`'s `renderSignal()` has no dedup either, so the same content appears 2–3 times verbatim in both the Hypothesize and Test prompts. This is more than wasted tokens: the Test stage's system prompt explicitly defines HIGH confidence as "multiple independent, specific, corroborating sources." A page counted three times risks being read by the model as three independent sources agreeing, artificially inflating the confidence rating the owner uses to judge which hypotheses are worth pursuing.
4. **Indeed is unreliable for `extract()`, especially search-results-page URLs.** Live-verified: a re-run of `extract()` against the exact Indeed search-results URL stored in a real run failed outright (`"Failed to fetch url"`), while the same URL had returned partial page-chrome content (no real job data) in the original run. Distinct failure mode from #1 — not fixable by tuning the content cap.
5. **Tavily's per-URL `failedResults` are silently dropped, not even logged.** `gather.ts`'s extract loop only reads `extractRes.results`. Confirmed by live testing: a failed URL comes back as a normal 200 response with an empty `results` array and the failure listed separately in `failedResults` — it does not throw, so the existing `try/catch` never fires. Any future per-URL extract failure (blocked fetch, bad URL, transient outage) currently vanishes with zero trace anywhere — the same silent-data-loss failure class as the original extract-timeout bug (CLAUDE.md rule 12), just a different trigger, and still open today.
6. **No truncation indicator in the UI.** The run-detail page (`.../workflow/[runId]/page.tsx`) renders `item.content` raw. The only way to notice content was cut off is to read closely enough to spot an abrupt mid-word ending, which is how all of the above was actually found this session.

---

## 1. Goals and Non-Goals

**Goals:**
- Fix all six findings above in one pass — they are all small, contained changes concentrated in `gather.ts`, `engine.ts`, `prompts.ts` (implicitly, via shared data), `schema.prisma`, and the run-detail page.
- Make future instances of finding #5's failure class (silent per-URL drops) visible going forward, not just fix the currently-known instance.
- Keep the fix mechanism-based (ask Tavily for relevant content, dedupe structurally) rather than heuristic (regex-stripping boilerplate per site), consistent with CLAUDE.md's guidance against workarounds that require ongoing maintenance.

**Non-goals (explicitly out of scope for this pass):**
- **No change to `maxResults: 6` per search query, or to the fixed three-query set.** Dedup will reduce the typical unique-item count per run below what's been observed so far (e.g., the 18 raw `TAVILY_SEARCH` items in the last run were only 12 unique URLs) — this is the intended quality-over-quantity effect, not a regression to compensate for. Whether to raise `maxResults` is a tuning decision worth revisiting after seeing real post-fix run results, not something to guess at now.
- **No cross-source content-similarity dedup** (e.g. recognizing that Lensa and Built In both mirror the same underlying Greenhouse job list even when the URLs differ). Only exact (normalized) URL dedup is in scope. Content-similarity dedup is a much harder, fuzzier problem and not needed to fix the findings above.
- **No changes to the Hypothesize/Test prompts themselves**, beyond what dedup automatically removes from their input. The confidence-rating logic, evidence requirements, etc. are unchanged.
- **No changes to the production Research Engine** (`src/lib/research/`). This POC remains fully isolated, per the original design doc.

---

## 2. Design

### 2.1 Content relevance & caps (fixes finding #1)

**`extract()` calls** (owner-supplied URLs) gain two new options, live-verified against the real Tavily API to change output content meaningfully:
- `query: "job responsibilities, open positions, employee reviews, workplace culture, hiring needs, organizational challenges, growth or expansion signals"` — a fixed string, broad enough to stay useful across any page type an owner might paste (job board, review site, news article, LinkedIn company page), not narrowly tuned to job postings only.
- `chunksPerSource: 3`

Verified effect on `hillpointe.com/careers/`: without `query`, the first 1,500 characters are 100% cookie-consent text and nav links. With `query` + `chunksPerSource: 3`, total returned content drops to 2,355 characters and opens directly with employee testimonials and the actual "Open Positions" list.

**Two separate cap constants replace the single `MAX_CONTENT_CHARS`**, matching the existing precedent in this file of splitting values that don't actually share a unit (rule 12's `PER_CALL_TIMEOUT_MS` vs. `EXTRACT_TIMEOUT_SECONDS`):
- `EXTRACT_MAX_CONTENT_CHARS = 3000` — a backstop after query-targeting already trims to relevant chunks (observed ~2,355 chars in live testing).
- `SEARCH_MAX_CONTENT_CHARS = 3000` — `search()`'s `content` field is already Tavily's own curated snippet (observed 2,000–2,400 chars across live testing, never anywhere near the old 1,500 cap's neighborhood), so this gives headroom to capture it in full rather than truncating mid-sentence.

### 2.2 URL deduplication (fixes findings #2 and #3)

Inside `gatherProbeSignal()`, track normalized URLs (trailing slash stripped) in a `Set` as items are collected. `extract()` results (owner-curated URLs) are added to the set first; `search()` results are then skipped if their normalized URL is already present — so an owner-supplied URL always wins over an auto-discovered duplicate of the same page.

This is a single fix at the source. Both the database write (`engine.ts`) and the LLM prompts (`prompts.ts`'s `renderSignal()`) consume the same deduped array returned from `gatherProbeSignal()`, so finding #3 (duplicate signal reaching the prompt, risking inflated confidence) is resolved as a direct consequence — no separate change needed in `prompts.ts`.

### 2.3 Failure visibility (fixes findings #4 and #5)

`gatherProbeSignal()`'s return type changes from `ProbeSignalItemInput[]` to:

```ts
{ items: ProbeSignalItemInput[], failures: { url: string; error: string }[] }
```

The extract loop reads `extractRes.failedResults` (currently ignored entirely) and populates `failures`. `items` — the real signal, deduped per §2.2 — is the only thing that ever reaches `probeHypothesizeUserMessage`/`probeTestUserMessage`; failures never pollute LLM input.

`engine.ts` persists `failures` as `ProbeSignalItem` rows using a new `EXTRACT_FAILED` value on the `ProbeSignalSource` enum (reuses existing infrastructure — no new table). For each failure: `url` = the failed URL, `content` = Tavily's error message, `title` = `null`.

The run-detail page renders `EXTRACT_FAILED` items in a separate "Extraction issues" section, excluded from the "Signal gathered (N)" count and header (which continues to reflect only real signal).

This also directly addresses finding #4 (Indeed unreliability) from a visibility standpoint — when an Indeed URL fails, the owner sees it immediately instead of just noticing a lower item count with no explanation. Since no code can make Indeed's bot detection cooperate, the accompanying fix there is one line of hint text on the run-trigger form near the URL input: *"Direct listing pages (e.g. a specific job posting) extract better than search-results pages (e.g. Indeed's job search)."*

### 2.4 UI truncation indicator (fixes finding #6)

In the run-detail page, if a signal item's `content.length` equals the cap that produced it exactly (`EXTRACT_MAX_CONTENT_CHARS` for `TAVILY_EXTRACT`/`MANUAL`, `SEARCH_MAX_CONTENT_CHARS` for `TAVILY_SEARCH`), render a small `"(truncated at Nk chars)"` note beneath the content. No new field needed — truncation is inferable from length alone.

---

## 3. Data Model Changes

One migration: add `EXTRACT_FAILED` to the `ProbeSignalSource` enum in `schema.prisma`.

```prisma
enum ProbeSignalSource {
  MANUAL
  TAVILY_SEARCH
  TAVILY_EXTRACT
  EXTRACT_FAILED
}
```

No other schema changes. No new tables.

---

## 4. Files Touched

- `src/lib/research-probe/gather.ts` — query/chunksPerSource on extract, two cap constants, URL-dedup Set, `failures` return value reading `extractRes.failedResults`.
- `src/lib/research-probe/engine.ts` — destructure `{ items, failures }`, persist `failures` as `EXTRACT_FAILED` signal items, pass only `items` to the Hypothesize/Test prompt builders.
- `prisma/schema.prisma` — add `EXTRACT_FAILED` enum value; run `prisma migrate dev`.
- `src/app/(dashboard)/departments/product-research/workflow/[runId]/page.tsx` — render `EXTRACT_FAILED` items in a separate "Extraction issues" section excluded from the main count; render truncation note when content hits its cap.
- The Workflow run-trigger form (wherever the URL input lives) — one line of hint text about Indeed/search-results pages.

No changes to `src/lib/research-probe/prompts.ts` or `schemas.ts` — dedup and failure-filtering happen before either is invoked.

---

## 5. Validation

Once built, re-run against Hillpointe (known-answer sanity check, consistent with the original POC's validation approach) and compare against the two runs already reviewed this session:
- Unique-URL count in "Signal gathered" should roughly match previous total minus the ~5 duplicate groups observed per run.
- The `hillpointe.com/careers` extract item should open with testimonials/open-positions content, not cookie-consent text.
- No signal item's content should end mid-word at exactly 1,500 characters.
- If any owner-supplied URL fails (e.g. re-testing the same Indeed search-results URL), it should appear in a visible "Extraction issues" section, not just be absent.
