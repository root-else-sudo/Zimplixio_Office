export interface TavilyQuerySpec {
  group: 'general' | 'advocacy' | 'alignable' | 'reddit'
  query: string
  includeDomains?: string[]
  searchDepth: 'basic' | 'advanced'
  maxResults: number
}

// Fixed query set for the Gather step's "easy sources" — general web search
// plus tier-1 domain-targeted search (NFIB/SCORE/SBA/Alignable/Reddit).
// Podcasts, books, and per-medium extraction are a deliberately deferred
// design task (planning §2.3) — not built here.
//
// Extension point: rotate/vary query text over time (e.g. by ISO week) to
// reduce staleness. Not built now — revisit if runs start returning the same
// signal repeatedly.
export const RESEARCH_QUERIES: TavilyQuerySpec[] = [
  {
    group: 'general',
    query: 'biggest problems and challenges small business owners are facing right now',
    searchDepth: 'basic',
    maxResults: 5,
  },
  {
    group: 'general',
    query:
      'small business owner frustrations with manual processes spreadsheets and outdated software',
    searchDepth: 'basic',
    maxResults: 5,
  },
  {
    group: 'advocacy',
    query: 'small business owner survey pain points challenges',
    includeDomains: ['nfib.com', 'score.org', 'sba.gov'],
    searchDepth: 'basic',
    maxResults: 5,
  },
  {
    group: 'alignable',
    query: 'small business owners discussing their biggest challenges',
    includeDomains: ['alignable.com'],
    searchDepth: 'basic',
    maxResults: 5,
  },
  {
    group: 'reddit',
    query: 'site:reddit.com r/smallbusiness biggest challenges running a small business',
    includeDomains: ['reddit.com'],
    searchDepth: 'advanced',
    maxResults: 8,
  },
]
