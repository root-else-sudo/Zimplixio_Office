import { tavily, type TavilyClient } from '@tavily/core'
import { serverEnv } from '../env'
import { logger } from '../logger'
import { RESEARCH_QUERIES } from './queries'

// Lazy singleton — never instantiated at module load (build time serverEnv is empty).
let _tavily: TavilyClient | null = null
function getTavily(): TavilyClient {
  if (!_tavily) _tavily = tavily({ apiKey: serverEnv.TAVILY_API_KEY })
  return _tavily
}

export interface SignalItem {
  group: string
  title: string
  url: string
  content: string
}

const MAX_CONTENT_CHARS = 600
const PER_CALL_TIMEOUT_MS = 15_000

// Runs the fixed, bounded set of Tavily searches concurrently. One call
// failing doesn't kill the others — Promise.allSettled, not .all.
export async function gatherSignal(): Promise<SignalItem[]> {
  const client = getTavily()

  const settled = await Promise.allSettled(
    RESEARCH_QUERIES.map((spec) =>
      client.search(spec.query, {
        searchDepth: spec.searchDepth,
        maxResults: spec.maxResults,
        includeDomains: spec.includeDomains,
        includeAnswer: false,
        includeRawContent: false,
        timeout: PER_CALL_TIMEOUT_MS,
      }).then((res) => ({ spec, res }))
    )
  )

  const items: SignalItem[] = []
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      logger.warn({ err: outcome.reason }, 'research.gather: a Tavily query failed, continuing')
      continue
    }
    const { spec, res } = outcome.value
    for (const result of res.results) {
      items.push({
        group: spec.group,
        title: result.title,
        url: result.url,
        content: result.content.slice(0, MAX_CONTENT_CHARS),
      })
    }
  }

  logger.info(
    { queries: RESEARCH_QUERIES.length, succeeded: settled.filter((s) => s.status === 'fulfilled').length, items: items.length },
    'research.gather: complete'
  )

  return items
}
