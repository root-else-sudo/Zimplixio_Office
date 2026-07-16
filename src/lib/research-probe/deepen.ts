import { logger } from '../logger'
import type { ProbeSignalItemInput } from './gather'
import {
  getTavily,
  normalizeUrl,
  EXTRACT_MAX_CONTENT_CHARS,
  EXTRACT_TIMEOUT_SECONDS,
  EXTRACT_RELEVANCE_QUERY,
  EXTRACT_CHUNKS_PER_SOURCE,
} from './gather'

// search()'s content field is Tavily's own pre-indexed snippet — short (observed
// 2,000-2,400 chars) and sometimes dominated by irrelevant page chrome (e.g. a
// LinkedIn company page's platform-wide job-count stats), because it's an index
// lookup, not a live fetch. This step replaces every tavily_search item's content
// with a real extract() fetch, the same relevance-targeted mechanism already
// proven on owner-pasted URLs (fix pass #1), BEFORE Review runs — so Review judges
// (and, for mixed-content items, cleans) the fuller real content, not the shallow
// snippet. Runs before Review rather than after so Review's own content edits
// (schemas.ts's cleanedContent) never get clobbered by a later re-fetch. One
// batched extract() call for every tavily_search item's URL, not one call per
// item — same shape as gather.ts's own extract() call. On any failure (whole call
// throws, or a specific URL comes back in failedResults), that item just keeps
// its original search() snippet — some signal beats none, unlike a
// manually-pasted URL where extract() is the only source.
//
// Also returns which domains failed — a bot-blocked domain (Indeed, Glassdoor,
// etc.) is a real, detectable signal the caller (engine.ts) uses to register
// that domain for exact-match-scoped search treatment on future runs, since a
// domain we can never extract() from is one we're permanently stuck reading via
// search()'s broader, more easily-diluted snippet.
export interface DeepenResult {
  items: ProbeSignalItemInput[]
  failedDomains: string[]
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export async function deepenSignal(items: ProbeSignalItemInput[]): Promise<DeepenResult> {
  const candidates = items.filter((item) => item.group === 'tavily_search' && item.url)
  if (candidates.length === 0) return { items, failedDomains: [] }

  const urls = candidates.map((item) => item.url as string)
  const client = getTavily()

  try {
    const extractRes = await client.extract(urls, {
      extractDepth: 'advanced',
      timeout: EXTRACT_TIMEOUT_SECONDS,
      query: EXTRACT_RELEVANCE_QUERY,
      chunksPerSource: EXTRACT_CHUNKS_PER_SOURCE,
    })

    const deeperContentByUrl = new Map(
      extractRes.results.map((result) => [normalizeUrl(result.url), result.rawContent.slice(0, EXTRACT_MAX_CONTENT_CHARS)])
    )

    const failedDomains = [...new Set(
      extractRes.failedResults.map((failed) => extractDomain(failed.url)).filter((d): d is string => d !== null)
    )]

    logger.info(
      {
        requested: urls.length,
        deepened: extractRes.results.length,
        failed: extractRes.failedResults.length,
      },
      'research-probe.deepen: complete'
    )

    const deepened = items.map((item) => {
      if (!item.url) return item
      const deeperContent = deeperContentByUrl.get(normalizeUrl(item.url))
      if (!deeperContent) return item
      return { ...item, content: deeperContent }
    })

    return { items: deepened, failedDomains }
  } catch (err) {
    logger.warn({ err }, 'research-probe.deepen: extract call failed, keeping original search snippets')
    return { items, failedDomains: [] }
  }
}
