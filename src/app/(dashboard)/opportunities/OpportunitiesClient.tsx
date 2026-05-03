'use client'

import { useState } from 'react'
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

type Opportunity = {
  id: string
  title: string
  sector: string
  signal: string
  zimplixioAngle: string
  actions: string[]
  generatedAt: string
}

const SECTOR_COLORS: Record<string, string> = {
  'Professional Services':     '#6366f1',
  'Construction & Trades':     '#f59e0b',
  'Healthcare & Wellness':     '#10b981',
  'Retail & E-commerce':       '#3b82f6',
  'Logistics & Distribution':  '#8b5cf6',
}

function getSectorColor(sector: string) {
  return SECTOR_COLORS[sector] ?? '#6b7280'
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type Props = {
  initialOpportunities: Opportunity[]
  isAdmin: boolean
}

export default function OpportunitiesClient({ initialOpportunities, isAdmin }: Props) {
  const [opportunities, setOpportunities] = useState(initialOpportunities)
  const [findingOpps, setFindingOpps]     = useState(false)
  const [expandedOpp, setExpandedOpp]     = useState<string | null>(null)

  async function findOpportunities() {
    setFindingOpps(true)
    try {
      const res  = await fetch('/api/opportunities', { method: 'POST' })
      const data = await res.json()
      if (data.opportunities) {
        setOpportunities(prev => [...data.opportunities, ...prev])
      }
    } catch (e) {
      console.error('Find opportunities failed:', e)
    } finally {
      setFindingOpps(false)
    }
  }

  return (
    <div className="p-7 md:p-10 max-w-4xl mx-auto space-y-7">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">AI-Powered</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
            Business Opportunities
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            AI-generated SMB opportunities with market signals and action plans.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={findOpportunities}
            disabled={findingOpps}
            className="btn-primary mt-1"
          >
            {findingOpps
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Finding…</>
              : <><Sparkles className="w-4 h-4" /> Find Opportunities</>
            }
          </button>
        )}
      </div>

      {/* Count */}
      {opportunities.length > 0 && (
        <p className="text-xs text-gray-400">{opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'} found</p>
      )}

      {/* Empty state */}
      {opportunities.length === 0 ? (
        <div className="soft-card px-8 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-indigo-300" />
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">No opportunities yet</p>
          <p className="text-sm text-gray-400">
            {isAdmin
              ? 'Click "Find Opportunities" to generate 5 targeted SMB opportunities using Tavily + Claude.'
              : 'No opportunities have been generated yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => {
            const isOpen = expandedOpp === opp.id
            const color  = getSectorColor(opp.sector)

            return (
              <div key={opp.id} className="soft-card overflow-hidden">
                <button
                  onClick={() => setExpandedOpp(isOpen ? null : opp.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left"
                >
                  {/* Sector color bar */}
                  <div className="w-1 h-10 rounded-full shrink-0" style={{ background: color }} />

                  <div className="flex-1 min-w-0">
                    <span
                      className="badge text-xs font-semibold mb-1 inline-flex"
                      style={{ background: `${color}18`, color }}
                    >
                      {opp.sector}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 truncate">{opp.title}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400">{timeAgo(opp.generatedAt)}</span>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 border-t border-gray-50">
                    <div className="grid grid-cols-2 gap-5 mt-5 mb-5">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Market Signal</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{opp.signal}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Zimplixio Angle</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{opp.zimplixioAngle}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">5 Action Items</p>
                      <ol className="space-y-2.5">
                        {(opp.actions as string[]).map((action, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                              style={{ background: `${color}18`, color }}
                            >
                              {i + 1}
                            </span>
                            <p className="text-sm text-gray-700 leading-relaxed">{action}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
