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

const MAX_CONTENT_CHARS = 1500
const PER_CALL_TIMEOUT_MS = 20_000

// Gather signal about ONE named company — manual notes the owner typed in,
// optional URLs the owner supplies (fetched directly via Tavily's extract()),
// and a small set of targeted search() queries against the company name.
// Deliberately different from src/lib/research/tavily.ts's gatherSignal(),
// which runs a fixed set of generic market-wide queries — this is scoped to
// one company on purpose (design doc §4).
export async function gatherProbeSignal(opts: {
  companyName: string
  manualNotes?: string
  urls?: string[]
}): Promise<ProbeSignalItemInput[]> {
  const items: ProbeSignalItemInput[] = []

  if (opts.manualNotes && opts.manualNotes.trim()) {
    items.push({ group: 'manual', title: null, url: null, content: opts.manualNotes.trim() })
  }

  const client = getTavily()

  if (opts.urls && opts.urls.length > 0) {
    try {
      const extractRes = await client.extract(opts.urls, {
        extractDepth: 'advanced',
        timeout: PER_CALL_TIMEOUT_MS,
      })
      for (const result of extractRes.results) {
        items.push({
          group: 'tavily_extract',
          title: result.title,
          url: result.url,
          content: result.rawContent.slice(0, MAX_CONTENT_CHARS),
        })
      }
    } catch (err) {
      logger.warn({ err }, 'research-probe.gather: extract failed, continuing')
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
      items.push({
        group: 'tavily_search',
        title: result.title,
        url: result.url,
        content: result.content.slice(0, MAX_CONTENT_CHARS),
      })
    }
  }

  logger.info(
    { companyName: opts.companyName, items: items.length },
    'research-probe.gather: complete'
  )

  return items
}
