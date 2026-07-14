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
