# Research Probe Data Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six data-quality problems found while manually reviewing two live Research Probe runs — a flat truncation cap that cuts off content two different ways, no URL deduplication (which also inflates LLM confidence ratings), silently-dropped Tavily extract failures, and no UI indication of any of the above.

**Architecture:** All changes are concentrated in the Gather step (`src/lib/research-probe/gather.ts`) and its two direct consumers (`engine.ts`, the run-detail page). `gather.ts` gains: query-targeted extraction, two separate content caps, URL-based dedup, and structured failure reporting. `engine.ts` persists failures as a new signal-item source instead of dropping them. The run-detail page renders failures separately and flags truncated content. No changes to the Hypothesize/Test prompts' logic, the production Research Engine, or `maxResults`.

**Tech Stack:** Next.js (TypeScript strict), Prisma/Postgres, `@tavily/core` SDK.

**No automated test suite exists in this repo** (confirmed: no `test` script in `package.json`, zero `*.test.ts`/`*.spec.ts` files anywhere). This project's established verification convention — used throughout the spec's own research (see `docs/superpowers/specs/2026-07-14-research-probe-data-quality-fixes-design.md`) — is `tsc --noEmit` plus live sanity checks against the real Tavily API and a real local dev run, per CLAUDE.md rules 9 and 12 ("sanity-check any new Tavily/Anthropic call against a real URL/schema before trusting it end-to-end"). This plan follows that convention: each task's verification step is a live check, not a unit test.

## Global Constraints

- `EXTRACT_MAX_CONTENT_CHARS = 3000` (was one shared `MAX_CONTENT_CHARS = 1500`)
- `SEARCH_MAX_CONTENT_CHARS = 3000` (was the same shared `MAX_CONTENT_CHARS = 1500`)
- `EXTRACT_CHUNKS_PER_SOURCE = 3`
- Extract relevance query (verbatim, fixed string, not per-URL-tuned): `'job responsibilities, open positions, employee reviews, workplace culture, hiring needs, organizational challenges, growth or expansion signals'`
- URL dedup is normalized-URL-exact only (trailing slash stripped) — no cross-source content-similarity dedup
- `maxResults: 6` per search query is unchanged — do not touch
- No changes to `src/lib/research-probe/prompts.ts` or `schemas.ts`
- No changes to `src/lib/research/` (the production Research Engine) — this POC stays fully isolated
- New Prisma enum value: `EXTRACT_FAILED` on `ProbeSignalSource`, no new tables

---

### Task 1: Add `EXTRACT_FAILED` signal source to the schema

**Files:**
- Modify: `prisma/schema.prisma` (the `ProbeSignalSource` enum, currently 4 lines starting `enum ProbeSignalSource {`)

**Interfaces:**
- Consumes: nothing
- Produces: `ProbeSignalSource` Prisma-generated TS type now includes the literal `'EXTRACT_FAILED'`, usable by Task 3

- [ ] **Step 1: Edit the enum**

Find in `prisma/schema.prisma`:

```prisma
enum ProbeSignalSource {
  MANUAL
  TAVILY_SEARCH
  TAVILY_EXTRACT
}
```

Replace with:

```prisma
enum ProbeSignalSource {
  MANUAL
  TAVILY_SEARCH
  TAVILY_EXTRACT
  EXTRACT_FAILED
}
```

- [ ] **Step 2: Run the migration against your local dev database**

Run: `npx prisma migrate dev --name add_extract_failed_signal_source`

Expected: a new migration folder created under `prisma/migrations/`, output ends with `Your database is now in sync with your schema.` and the Prisma client is regenerated automatically (this command runs `prisma generate` for you).

Note: this only touches your **local** Postgres (the `DATABASE_URL` in `.env`). Railway's `development` database migrates automatically on the next deploy via its pre-deploy command — you don't need to run anything against Railway directly.

- [ ] **Step 3: Verify the client picked up the new enum value**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"`

Expected: no new errors (there's nothing referencing `EXTRACT_FAILED` yet, so this just confirms the client regenerated cleanly).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add EXTRACT_FAILED signal source for surfacing failed Tavily extracts"
```

---

### Task 2: Rewrite the Gather step — relevance targeting, split caps, URL dedup, failure reporting

**Files:**
- Modify: `src/lib/research-probe/gather.ts` (entire file, 104 lines currently)

**Interfaces:**
- Consumes: `TavilyClient` from `@tavily/core` (unchanged), `serverEnv.TAVILY_API_KEY`, `logger` (unchanged)
- Produces: `gatherProbeSignal(opts: { companyName: string; manualNotes?: string; urls?: string[] }): Promise<ProbeSignalResult>` where:
  ```ts
  export interface ProbeSignalFailure {
    url: string
    error: string
  }
  export interface ProbeSignalResult {
    items: ProbeSignalItemInput[]
    failures: ProbeSignalFailure[]
  }
  ```
  Also exports `EXTRACT_MAX_CONTENT_CHARS` and `SEARCH_MAX_CONTENT_CHARS` (needed by Task 4). `ProbeSignalItemInput` is unchanged (same shape as today).

- [ ] **Step 1: Replace the full file contents**

Replace all of `src/lib/research-probe/gather.ts` with:

```ts
import { tavily, type TavilyClient } from '@tavily/core'
import { serverEnv } from '../env'
import { logger } from '../logger'

// Lazy singleton — never instantiated at module load (build time serverEnv is empty).
let _tavily: TavilyClient | null = null
function getTavily(): TavilyClient {
  if (!_tavily) _tavily = tavily({ apiKey: serverEnv.TAVILY_API_KEY })
  return _tavily
}

export interface ProbeSignalItemInput {
  group: 'manual' | 'tavily_search' | 'tavily_extract'
  title: string | null
  url: string | null
  content: string
}

export interface ProbeSignalFailure {
  url: string
  error: string
}

export interface ProbeSignalResult {
  items: ProbeSignalItemInput[]
  failures: ProbeSignalFailure[]
}

// extract()'s rawContent is the full raw page (can run 15k+ chars on
// nav/boilerplate-heavy sites); search()'s content field is Tavily's own
// curated snippet (observed 2,000-2,400 chars live). Different budgets on
// purpose, not one shared constant — same reasoning as PER_CALL_TIMEOUT_MS
// vs EXTRACT_TIMEOUT_SECONDS below.
export const EXTRACT_MAX_CONTENT_CHARS = 3000
export const SEARCH_MAX_CONTENT_CHARS = 3000
const PER_CALL_TIMEOUT_MS = 20_000
// Tavily's extract() and search() disagree on the unit of their `timeout`
// option — search() takes milliseconds, extract() takes seconds (1-120) and
// throws "timeout must be between 1 and 120 seconds" otherwise. Confirmed
// directly against the real API: passing PER_CALL_TIMEOUT_MS (20_000) to
// extract() made every extract() call fail silently (caught below), which is
// why manually-supplied URLs never produced any TAVILY_EXTRACT signal items.
const EXTRACT_TIMEOUT_SECONDS = 20

// Steers extract() toward actual page content instead of a raw
// front-of-page dump — verified live against hillpointe.com/careers/:
// without this, the first EXTRACT_MAX_CONTENT_CHARS were 100% cookie-consent
// text and nav links; with it, the same call opens with real page content.
// Deliberately broad (not job-posting-specific) since owner-pasted URLs can
// be any page type — a review site, a news article, a LinkedIn company page.
const EXTRACT_RELEVANCE_QUERY =
  'job responsibilities, open positions, employee reviews, workplace culture, hiring needs, organizational challenges, growth or expansion signals'
const EXTRACT_CHUNKS_PER_SOURCE = 3

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

// Gather signal about ONE named company — manual notes the owner typed in,
// optional URLs the owner supplies (fetched directly via Tavily's extract()),
// and a small set of targeted search() queries against the company name.
// Deliberately different from src/lib/research/tavily.ts's gatherSignal(),
// which runs a fixed set of generic market-wide queries — this is scoped to
// one company on purpose (design doc §4). Deduplicates by normalized URL
// across extract + search results (extract wins — it's owner-curated), and
// reports any URL Tavily failed to extract instead of dropping it silently.
export async function gatherProbeSignal(opts: {
  companyName: string
  manualNotes?: string
  urls?: string[]
}): Promise<ProbeSignalResult> {
  const items: ProbeSignalItemInput[] = []
  const failures: ProbeSignalFailure[] = []
  const seenUrls = new Set<string>()

  if (opts.manualNotes && opts.manualNotes.trim()) {
    items.push({ group: 'manual', title: null, url: null, content: opts.manualNotes.trim() })
  }

  const client = getTavily()

  if (opts.urls && opts.urls.length > 0) {
    try {
      const extractRes = await client.extract(opts.urls, {
        extractDepth: 'advanced',
        timeout: EXTRACT_TIMEOUT_SECONDS,
        query: EXTRACT_RELEVANCE_QUERY,
        chunksPerSource: EXTRACT_CHUNKS_PER_SOURCE,
      })
      for (const result of extractRes.results) {
        seenUrls.add(normalizeUrl(result.url))
        items.push({
          group: 'tavily_extract',
          title: result.title,
          url: result.url,
          content: result.rawContent.slice(0, EXTRACT_MAX_CONTENT_CHARS),
        })
      }
      for (const failed of extractRes.failedResults) {
        failures.push({ url: failed.url, error: failed.error })
      }
    } catch (err) {
      logger.warn({ err }, 'research-probe.gather: extract failed, continuing')
      const message = err instanceof Error ? err.message : 'Unknown extract error'
      for (const url of opts.urls) {
        failures.push({ url, error: message })
      }
    }
  }

  const queries = [`${opts.companyName} jobs`, `${opts.companyName} careers`, `${opts.companyName} reviews`]

  const settled = await Promise.allSettled(
    queries.map((query) =>
      client
        .search(query, {
          searchDepth: 'advanced',
          maxResults: 6,
          includeAnswer: false,
          includeRawContent: false,
          timeout: PER_CALL_TIMEOUT_MS,
        })
        .then((res) => ({ res }))
    )
  )

  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      logger.warn({ err: outcome.reason }, 'research-probe.gather: a search query failed, continuing')
      continue
    }
    for (const result of outcome.value.res.results) {
      const normalized = normalizeUrl(result.url)
      if (seenUrls.has(normalized)) continue
      seenUrls.add(normalized)
      items.push({
        group: 'tavily_search',
        title: result.title,
        url: result.url,
        content: result.content.slice(0, SEARCH_MAX_CONTENT_CHARS),
      })
    }
  }

  logger.info(
    { companyName: opts.companyName, items: items.length, failures: failures.length },
    'research-probe.gather: complete'
  )

  return { items, failures }
}
```

- [ ] **Step 2: Type-check**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"`

Expected: new errors in `src/lib/research-probe/engine.ts` (it still calls `gatherProbeSignal` expecting the old array return type) — that's expected, Task 3 fixes it. No errors should appear inside `gather.ts` itself. If there are errors in `gather.ts`, fix them before proceeding.

- [ ] **Step 3: Live sanity check against the real Tavily API**

This mirrors how the truncation and dedup problems were originally found and confirmed in this project — a real API call, not a mock. Run this from the repo root (reads `TAVILY_API_KEY` from `.env`):

```bash
TAVILY_KEY=$(grep -o '^TAVILY_API_KEY=.*' .env | sed 's/TAVILY_API_KEY=//' | tr -d '"')
curl -s -X POST https://api.tavily.com/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TAVILY_KEY" \
  -d '{"urls": ["https://www.hillpointe.com/careers/"], "extract_depth": "advanced", "query": "job responsibilities, open positions, employee reviews, workplace culture, hiring needs, organizational challenges, growth or expansion signals", "chunks_per_source": 3}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['results'][0]['raw_content'][:500])"
```

Expected: output opens with real page content (employee testimonials or open positions), NOT cookie-consent/nav text like `"We use essential cookies..."`. If it still opens with cookie text, the `query` param isn't taking effect — stop and re-check the request body against the SDK's `TavilyExtractOptions` type before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/research-probe/gather.ts
git commit -m "Add relevance-targeted extraction, split content caps, URL dedup, and failure reporting to Research Probe gather step"
```

---

### Task 3: Persist failures, feed only deduped items to the LLM

**Files:**
- Modify: `src/lib/research-probe/engine.ts:53-96` (the gather call, the empty check, and the signal-item persistence)
- Modify: `src/lib/research-probe/engine.ts:83-87` and `:125-130` (the two prompt builder call sites — replace `signal` with `items`)

**Interfaces:**
- Consumes: `gatherProbeSignal` returning `Promise<ProbeSignalResult>` (Task 2), `ProbeSignalSource` including `'EXTRACT_FAILED'` (Task 1)
- Produces: no new exports — `runResearchProbe`'s public signature is unchanged

- [ ] **Step 1: Replace the gather call, empty check, and signal persistence**

Find in `src/lib/research-probe/engine.ts` (currently lines 53–75):

```ts
    const signal = await gatherProbeSignal({
      companyName: opts.companyName,
      manualNotes: opts.manualNotes,
      urls: opts.urls,
    })

    if (signal.length === 0) {
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'No signal gathered — nothing to reason about', completedAt: new Date() },
      })
      return { runId: run.id }
    }

    await prisma.probeSignalItem.createMany({
      data: signal.map((item) => ({
        runId: run.id,
        source: item.group === 'manual' ? 'MANUAL' : item.group === 'tavily_search' ? 'TAVILY_SEARCH' : 'TAVILY_EXTRACT',
        title: item.title,
        url: item.url,
        content: item.content,
      })),
    })
```

Replace with:

```ts
    const { items, failures } = await gatherProbeSignal({
      companyName: opts.companyName,
      manualNotes: opts.manualNotes,
      urls: opts.urls,
    })

    if (items.length + failures.length > 0) {
      await prisma.probeSignalItem.createMany({
        data: [
          ...items.map((item) => ({
            runId: run.id,
            source: item.group === 'manual' ? 'MANUAL' : item.group === 'tavily_search' ? 'TAVILY_SEARCH' : 'TAVILY_EXTRACT',
            title: item.title,
            url: item.url,
            content: item.content,
          })),
          ...failures.map((failure) => ({
            runId: run.id,
            source: 'EXTRACT_FAILED',
            title: null,
            url: failure.url,
            content: failure.error,
          })),
        ],
      })
    }

    if (items.length === 0) {
      await prisma.probeRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'No signal gathered — nothing to reason about', completedAt: new Date() },
      })
      return { runId: run.id }
    }
```

Note the reordering: failures are persisted even when the run ends up `FAILED` due to zero real items, so the owner can see *why* (e.g. every supplied URL failed to extract) instead of just an empty run.

- [ ] **Step 2: Update the two prompt builder call sites to use `items`**

Find (currently around line 83–87):

```ts
          content: probeHypothesizeUserMessage({
            companyName: opts.companyName,
            companyProfile: companyProfile.content,
            signal,
          }),
```

Replace with:

```ts
          content: probeHypothesizeUserMessage({
            companyName: opts.companyName,
            companyProfile: companyProfile.content,
            signal: items,
          }),
```

Find (currently around line 125–130):

```ts
          content: probeTestUserMessage({
            companyName: opts.companyName,
            companyProfile: companyProfile.content,
            hypotheses,
            signal,
          }),
```

Replace with:

```ts
          content: probeTestUserMessage({
            companyName: opts.companyName,
            companyProfile: companyProfile.content,
            hypotheses,
            signal: items,
          }),
```

- [ ] **Step 3: Type-check**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"`

Expected: clean — no errors in `engine.ts` or `gather.ts`. If `source: 'EXTRACT_FAILED'` shows a type error, confirm Task 1's migration actually ran (`npx prisma generate` regenerates the enum type; re-run `npx prisma migrate dev` if needed).

- [ ] **Step 4: Commit**

```bash
git add src/lib/research-probe/engine.ts
git commit -m "Persist extract failures as EXTRACT_FAILED signal items, feed only deduped items to Hypothesize/Test"
```

---

### Task 4: Show extraction failures and truncation in the run-detail page

**Files:**
- Modify: `src/app/(dashboard)/departments/product-research/workflow/[runId]/page.tsx` (entire file, 90 lines currently)

**Interfaces:**
- Consumes: `EXTRACT_MAX_CONTENT_CHARS`, `SEARCH_MAX_CONTENT_CHARS` from `@/lib/research-probe/gather` (Task 2); `ProbeSignalItem` rows now include `source: 'EXTRACT_FAILED'` rows (Task 3)
- Produces: no exports — this is a page component

- [ ] **Step 1: Replace the full file contents**

Replace all of `src/app/(dashboard)/departments/product-research/workflow/[runId]/page.tsx` with:

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { EXTRACT_MAX_CONTENT_CHARS, SEARCH_MAX_CONTENT_CHARS } from '@/lib/research-probe/gather'

const CONFIDENCE_STYLE: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: 'var(--green-50)', color: 'var(--green-600)' },
  MEDIUM: { bg: 'var(--copper-100)', color: 'var(--copper-500)' },
  LOW: { bg: '#F3F4F6', color: 'var(--gray-600)' },
}

function truncationCapFor(source: string): number | null {
  if (source === 'TAVILY_EXTRACT') return EXTRACT_MAX_CONTENT_CHARS
  if (source === 'TAVILY_SEARCH') return SEARCH_MAX_CONTENT_CHARS
  return null
}

export default async function WorkflowRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const run = await prisma.probeRun.findUnique({
    where: { id: runId },
    include: {
      signalItems: { orderBy: { createdAt: 'asc' } },
      hypotheses: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!run) notFound()

  const signalItems = run.signalItems.filter((item) => item.source !== 'EXTRACT_FAILED')
  const failedExtracts = run.signalItems.filter((item) => item.source === 'EXTRACT_FAILED')

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
      <div>
        <p className="eyebrow">Workflow / {run.companyName}</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          {run.companyName}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
          Status: {run.status}
          {run.errorMessage ? ` — ${run.errorMessage}` : ''}
          {run.costUsd != null ? ` · $${run.costUsd.toFixed(4)}` : ''}
        </p>
      </div>

      {failedExtracts.length > 0 && (
        <section className="space-y-3">
          <p className="eyebrow">Extraction issues ({failedExtracts.length})</p>
          {failedExtracts.map((item) => (
            <div key={item.id} className="soft-card px-5 py-4 space-y-1">
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-xs underline break-all" style={{ color: 'var(--gray-600)' }}>
                  {item.url}
                </a>
              )}
              <p className="text-sm" style={{ color: 'var(--error)' }}>{item.content}</p>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <p className="eyebrow">Signal gathered ({signalItems.length})</p>
        {signalItems.map((item) => {
          const cap = truncationCapFor(item.source)
          const truncated = cap !== null && item.content.length === cap
          return (
            <div key={item.id} className="soft-card px-5 py-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--copper-500)' }}>
                {item.source}
                {item.title ? ` — ${item.title}` : ''}
              </p>
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-xs underline break-all" style={{ color: 'var(--gray-600)' }}>
                  {item.url}
                </a>
              )}
              <p className="text-sm" style={{ color: 'var(--gray-900)' }}>{item.content}</p>
              {truncated && (
                <p className="text-xs italic" style={{ color: 'var(--gray-600)' }}>
                  (truncated at {(cap / 1000).toFixed(1)}k chars)
                </p>
              )}
            </div>
          )
        })}
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Hypotheses ({run.hypotheses.length})</p>
        {run.hypotheses.length === 0 && (
          <div className="soft-card px-6 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--gray-600)' }}>No hypotheses were proposed for this run.</p>
          </div>
        )}
        {run.hypotheses.map((h) => (
          <div key={h.id} className="soft-card px-5 py-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{h.title ?? h.need}</p>
              {h.confidence && (
                <span
                  className="badge shrink-0"
                  style={{ background: CONFIDENCE_STYLE[h.confidence].bg, color: CONFIDENCE_STYLE[h.confidence].color }}
                >
                  {h.confidence}
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--gray-600)' }}>
              Need: {h.need} → Proposed: {h.proposedService}
            </p>
            {h.evidence && (
              <p className="text-sm" style={{ color: 'var(--gray-900)' }}>{h.evidence}</p>
            )}
            {h.fitRationale && (
              <p className="text-xs" style={{ color: 'var(--gray-600)' }}>Fit: {h.fitRationale}</p>
            )}
            {h.disconfirmingEvidence && (
              <p className="text-xs" style={{ color: 'var(--error)' }}>Disconfirming: {h.disconfirmingEvidence}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/departments/product-research/workflow/[runId]/page.tsx"
git commit -m "Show extraction failures and truncation notices in the Workflow run-detail page"
```

---

### Task 5: Add URL-quality hint text to the trigger form

**Files:**
- Modify: `src/app/(dashboard)/departments/product-research/workflow/WorkflowTriggerForm.tsx:72-83` (the URLs field block)

**Interfaces:**
- Consumes: nothing
- Produces: nothing new — purely additive UI text

- [ ] **Step 1: Add the hint paragraph**

Find in `WorkflowTriggerForm.tsx`:

```tsx
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--gray-900)' }}>
          URLs to fetch directly (optional, one per line)
        </label>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={2}
          placeholder="https://..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
        />
      </div>
```

Replace with:

```tsx
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--gray-900)' }}>
          URLs to fetch directly (optional, one per line)
        </label>
        <p className="text-xs mb-1.5" style={{ color: 'var(--gray-600)' }}>
          Direct listing pages (e.g. a specific job posting) extract better than search-results pages (e.g. Indeed&apos;s job search).
        </p>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={2}
          placeholder="https://..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
        />
      </div>
```

- [ ] **Step 2: Type-check**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/departments/product-research/workflow/WorkflowTriggerForm.tsx"
git commit -m "Add URL-quality hint text to Research Probe trigger form"
```

---

### Task 6: End-to-end verification against a real run

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–5

- [ ] **Step 1: Start the local dev server**

Run: `npm run dev`

Expected: server starts on `http://localhost:3000` with no startup errors.

- [ ] **Step 2: Trigger a real probe run**

In the browser, log in, navigate to Product/Research → Workflow, and start a new run with:
- Company name: `Hillpointe`
- URLs: `https://www.hillpointe.com/careers/` and `https://job-boards.greenhouse.io/hillpointe/jobs/4879855008` (the same two URLs used to find the original bugs, for direct before/after comparison)

Expected: run completes with status `COMPLETE` within ~60 seconds.

- [ ] **Step 3: Verify the fixes on the run-detail page**

Check all of the following against the completed run's page:
- The `hillpointe.com/careers/` `TAVILY_EXTRACT` item opens with testimonial or open-positions content, not cookie-consent/nav text.
- No URL appears more than once under "Signal gathered."
- If any URL failed to extract, it appears under a visible "Extraction issues" section — not just absent with no explanation.
- No signal item's content ends abruptly mid-word with no explanation; any item that does hit its cap shows a "(truncated at 3.0k chars)" note.

Expected: all four hold true. If any fail, stop and re-check the corresponding task's code before considering this plan complete — do not report this work as done based on the type-check alone.

- [ ] **Step 4: Confirm the form hint is visible**

On the trigger form, confirm the new hint text appears under the "URLs to fetch directly" label, above the textarea.

Expected: visible, matches the text from Task 5 Step 1.
