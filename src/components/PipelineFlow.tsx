'use client'

import { useState, useEffect } from 'react'
import {
  X, Clock, CheckCircle, AlertCircle, Loader2, ChevronDown,
  FileCode2, Filter, Mail,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped'

type StepDef = {
  key: string
  label: string
  sublabel: string
  description: string
  inputOutput: string
  icon: React.ReactNode
  logMarker: string
}

type RunOption = {
  id: string
  startedAt: string
  status: string
}

// ── Service brand SVG icons ───────────────────────────────────────────────────

const GMAIL_COLOR  = '#EA4335'
const TAVILY_COLOR = '#0ea5e9'
const CLAUDE_COLOR = '#CC785C'
const PG_COLOR     = '#336791'

function GmailIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 6.5C2 5.67 2.67 5 3.5 5h17C21.33 5 22 5.67 22 6.5v11c0 .83-.67 1.5-1.5 1.5h-17C2.67 19 2 18.33 2 17.5v-11z" fill="#fff" stroke="#e5e7eb" strokeWidth="0.5"/>
      <path d="M2 7l10 6.5L22 7V17.5a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 17.5V7z" fill="white"/>
      <path d="M2 7l10 6.5L22 7" stroke={GMAIL_COLOR} strokeWidth="1.5" fill="none"/>
    </svg>
  )
}

function TavilyIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill={TAVILY_COLOR} />
      <circle cx="12" cy="12" r="4" fill="white" opacity="0.9"/>
      <path d="M12 4L12 8M12 16L12 20M4 12L8 12M16 12L20 12" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
    </svg>
  )
}

function ClaudeIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill={CLAUDE_COLOR}/>
      <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="serif">A</text>
    </svg>
  )
}

function PostgresIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="8" rx="8" ry="3.5" fill={PG_COLOR}/>
      <path d="M4 8v8c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V8" fill={PG_COLOR} opacity="0.8"/>
      <ellipse cx="12" cy="8" rx="8" ry="3.5" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3"/>
      <path d="M4 12c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5" stroke="white" strokeWidth="0.5" opacity="0.3"/>
    </svg>
  )
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS: StepDef[] = [
  {
    key: 'emails_fetch',
    label: 'Email Fetch',
    sublabel: 'Gmail API',
    description: 'Connects to Gmail and fetches recent emails from authorized senders (TLDR Newsletter, DragonNews Bytes).',
    inputOutput: 'In: Gmail inbox → Out: emails_raw.json',
    icon: <GmailIcon size={28} />,
    logMarker: 'emails_fetch',
  },
  {
    key: 'emails_parse',
    label: 'Parse',
    sublabel: 'Normalizer',
    description: 'Normalizes raw email data into a structured format, handling different sender parsers and decoding HTML entities.',
    inputOutput: 'In: emails_raw.json → Out: emails_parsed.json',
    icon: <FileCode2 size={22} color="#6b7280" />,
    logMarker: 'emails_parse',
  },
  {
    key: 'emails_filter',
    label: 'Filter',
    sublabel: 'Relevance',
    description: 'Scores each story by relevance to Zimplixio topics using 40+ keywords. Selects the top 2 most relevant stories.',
    inputOutput: 'In: emails_parsed.json → Out: emails_filtered.json (top 2)',
    icon: <Filter size={20} color="#6b7280" />,
    logMarker: 'emails_filter',
  },
  {
    key: 'context_search',
    label: 'Search',
    sublabel: 'Tavily',
    description: 'Runs rotating Tavily searches for fresh SMB market insights. Extracts 3–5 structured insights per run using Claude.',
    inputOutput: 'In: rotating queries → Out: market_context.json',
    icon: <TavilyIcon size={28} />,
    logMarker: 'context_search',
  },
  {
    key: 'posts_generate',
    label: 'Generate',
    sublabel: 'Claude AI',
    description: 'Generates 5 LinkedIn posts: 2 from email signals, 2 from Tavily research, 1 owned outcome post. Each enriched with market context.',
    inputOutput: 'In: filtered emails + market context → Out: posts_draft.json (5 posts)',
    icon: <ClaudeIcon size={28} />,
    logMarker: 'posts_generate',
  },
  {
    key: 'posts_save',
    label: 'Save',
    sublabel: 'PostgreSQL',
    description: 'Ingests the generated draft posts into the database and saves markdown files organized by date.',
    inputOutput: 'In: posts_draft.json → Out: Database (DRAFT status)',
    icon: <PostgresIcon size={28} />,
    logMarker: 'posts_save',
  },
  {
    key: 'emails_organize',
    label: 'Organize',
    sublabel: 'Gmail labels',
    description: 'Marks processed emails as read and moves them to the correct Gmail labels (Education/TLDR, Dragon CyberSecurity).',
    inputOutput: 'In: processed email IDs → Out: Gmail labels applied',
    icon: <Mail size={20} color="#6b7280" />,
    logMarker: 'emails_organize',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNodeStatuses(overallStatus: string, log: string): NodeStatus[] {
  if (!overallStatus) return STEPS.map(() => 'idle')
  if (overallStatus === 'RUNNING') {
    const completed = STEPS.filter(s => log.includes(`[${s.logMarker}`))
    return STEPS.map((_, i) => {
      if (i < completed.length) return 'success'
      if (i === completed.length) return 'running'
      return 'idle'
    })
  }
  if (overallStatus === 'SUCCESS') return STEPS.map(() => 'success')
  if (overallStatus === 'FAILED') {
    let lastFound = -1
    STEPS.forEach((s, i) => { if (log.includes(`[${s.logMarker}`)) lastFound = i })
    return STEPS.map((_, i) => {
      if (i <= lastFound - 1) return 'success'
      if (i === lastFound)    return 'failed'
      return 'skipped'
    })
  }
  return STEPS.map(() => 'idle')
}

function getNodeStyle(status: NodeStatus) {
  switch (status) {
    case 'success': return { ringColor: '#10b981', bgColor: 'rgba(16,185,129,0.07)' }
    case 'running': return { ringColor: '#6366f1', bgColor: 'rgba(99,102,241,0.07)' }
    case 'failed':  return { ringColor: '#ef4444', bgColor: 'rgba(239,68,68,0.07)' }
    case 'skipped': return { ringColor: '#e5e7eb', bgColor: '#f9fafb' }
    default:        return { ringColor: '#e5e7eb', bgColor: '#ffffff' }
  }
}

function getNodeOpacity(status: NodeStatus): number {
  return status === 'skipped' ? 0.4 : 1
}

function getMetric(log: string, logMarker: string, nextMarker?: string): string | null {
  if (!log) return null
  const start = log.indexOf(`[${logMarker}`)
  if (start === -1) return null
  const end = nextMarker ? log.indexOf(`[${nextMarker}`, start + 1) : log.length
  const segment = log.slice(start, end === -1 ? log.length : end)
  const match = segment.match(/(\d+)\s*(email|post|insight|record|stor|item|result)/i)
  if (!match) return null
  const noun = match[2].toLowerCase()
  const count = parseInt(match[1])
  const label =
    noun.startsWith('email')  ? (count === 1 ? 'email'   : 'emails')   :
    noun.startsWith('post')   ? (count === 1 ? 'post'    : 'posts')    :
    noun.startsWith('insight')? (count === 1 ? 'insight' : 'insights') :
    noun.startsWith('stor')   ? (count === 1 ? 'story'   : 'stories')  :
    noun + 's'
  return `${count} ${label}`
}

function extractLogSegment(log: string, stepKey: string, nextKey?: string): string {
  const start = log.indexOf(`[${stepKey}`)
  if (start === -1) return 'No log available for this step.'
  const end = nextKey ? log.indexOf(`[${nextKey}`, start + 1) : log.length
  const segment = log.slice(start, end === -1 ? log.length : end).trim()
  return segment.slice(0, 900) + (segment.length > 900 ? '…' : '')
}

function extractError(log: string, stepKey: string, nextKey?: string): string | null {
  const segment = extractLogSegment(log, stepKey, nextKey)
  const errorMatch = segment.match(/error[:\s]+(.+)/i)
  return errorMatch ? errorMatch[1].slice(0, 180) : null
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  overallStatus: string
  log: string
  startedAt?: string | null
  finishedAt?: string | null
  isRunning?: boolean
  recentRuns?: RunOption[]
  currentRunId?: string | null
}

export default function PipelineFlow({
  overallStatus: initialStatus,
  log: initialLog,
  startedAt: initialStartedAt,
  finishedAt: initialFinishedAt,
  recentRuns = [],
  currentRunId,
}: Props) {
  const [status,    setStatus]    = useState(initialStatus ?? '')
  const [log,       setLog]       = useState(initialLog ?? '')
  const [startedAt, setStartedAt] = useState(initialStartedAt ?? null)
  const [finishedAt,setFinishedAt]= useState(initialFinishedAt ?? null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    currentRunId ?? recentRuns[0]?.id ?? null
  )
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered,  setHovered]  = useState<number | null>(null)
  const [mounted,  setMounted]  = useState(false)

  // Entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80)
    return () => clearTimeout(t)
  }, [])

  // Sync when parent re-renders (new run started)
  useEffect(() => { setStatus(initialStatus ?? '') },    [initialStatus])
  useEffect(() => { setLog(initialLog ?? '') },          [initialLog])
  useEffect(() => { setStartedAt(initialStartedAt ?? null) }, [initialStartedAt])
  useEffect(() => { setFinishedAt(initialFinishedAt ?? null) }, [initialFinishedAt])
  useEffect(() => { if (currentRunId) setSelectedRunId(currentRunId) }, [currentRunId])

  // Live polling when RUNNING
  useEffect(() => {
    if (status !== 'RUNNING' || !selectedRunId) return
    const id = setInterval(async () => {
      try {
        const res  = await fetch(`/api/pipeline/${selectedRunId}`)
        if (!res.ok) return
        const data = await res.json()
        setStatus(data.status ?? '')
        setLog(data.log ?? '')
        setStartedAt(data.startedAt ?? null)
        setFinishedAt(data.finishedAt ?? null)
        if (data.status !== 'RUNNING') clearInterval(id)
      } catch { /* network blip — try next tick */ }
    }, 3000)
    return () => clearInterval(id)
  }, [status, selectedRunId])

  // Run selector: load a historical run
  async function handleRunChange(runId: string) {
    if (runId === selectedRunId) return
    setSelectedRunId(runId)
    try {
      const res  = await fetch(`/api/pipeline/${runId}`)
      if (!res.ok) return
      const data = await res.json()
      setStatus(data.status ?? '')
      setLog(data.log ?? '')
      setStartedAt(data.startedAt ?? null)
      setFinishedAt(data.finishedAt ?? null)
    } catch {}
  }

  const statuses    = getNodeStatuses(status, log)
  const failedIdx   = statuses.findIndex(s => s === 'failed')
  const hasFailedBranch = failedIdx >= 0

  const durationSec = startedAt && finishedAt
    ? Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    : null

  const selectedStep   = selected !== null ? STEPS[selected] : null
  const selectedStatus = selected !== null ? statuses[selected] : 'idle' as NodeStatus

  return (
    <div className="soft-card p-8 relative">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h2 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
            Agent Flow
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Run selector */}
          {recentRuns.length > 0 && (
            <div className="relative">
              <select
                value={selectedRunId ?? ''}
                onChange={e => handleRunChange(e.target.value)}
                className="text-xs text-gray-600 bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-2 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              >
                {recentRuns.map(r => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.startedAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {' — '}{r.status}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          )}

          {durationSec !== null && (
            <span className="font-mono text-xs bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-100 text-gray-500">
              {durationSec}s
            </span>
          )}

          {startedAt && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              {new Date(startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {status && (
            <span className={`badge ${
              status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' :
              status === 'FAILED'  ? 'bg-red-50 text-red-600' :
              status === 'RUNNING' ? 'bg-indigo-50 text-indigo-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {status === 'RUNNING'
                ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />RUNNING</span>
                : status}
            </span>
          )}
        </div>
      </div>

      {/* ── Flow diagram ────────────────────────────────────────────────── */}
      <div
        className="relative px-2"
        style={{ paddingBottom: hasFailedBranch ? 100 : 16 }}
      >
        <div className="flex items-start">
          {STEPS.map((step, i) => {
            const nodeStatus = statuses[i]
            const { ringColor, bgColor } = getNodeStyle(nodeStatus)
            const opacity = getNodeOpacity(nodeStatus)
            const isActive  = selected === i
            const isHovered = hovered === i
            const metric    = getMetric(log, step.logMarker, STEPS[i + 1]?.logMarker)
            const errorText = nodeStatus === 'failed'
              ? extractError(log, step.logMarker, STEPS[i + 1]?.logMarker)
              : null

            const connectorColor =
              nodeStatus === 'success' ? '#10b981' :
              nodeStatus === 'failed'  ? '#fca5a5' : '#e5e7eb'

            const showDots = status === 'RUNNING' &&
              (nodeStatus === 'success' || nodeStatus === 'running') &&
              i < STEPS.length - 1

            return (
              <div key={step.key} className="flex items-start flex-1 min-w-0">

                {/* ── Node ── */}
                <div
                  className="flex flex-col items-center gap-1.5 relative"
                  style={{
                    minWidth: 82,
                    opacity,
                    animation: mounted
                      ? `nodeEnter 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 65}ms both`
                      : 'none',
                  }}
                >

                  {/* Hover tooltip */}
                  {isHovered && !isActive && (
                    <div
                      className="absolute z-50 bg-white rounded-2xl border border-gray-100 text-left pointer-events-none"
                      style={{
                        width: 210,
                        bottom: 'calc(100% + 14px)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                        // Pin to left edge for first two, right edge for last two, otherwise center
                        ...(i <= 1
                          ? { left: 0 }
                          : i >= STEPS.length - 2
                          ? { right: 0 }
                          : { left: '50%', transform: 'translateX(-50%)' }),
                      }}
                    >
                      <div className="p-3.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: bgColor }}>
                            <div style={{ transform: 'scale(0.65)', transformOrigin: 'center', display: 'flex' }}>
                              {step.icon}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 leading-tight">{step.label}</p>
                            <p className="text-xs text-gray-400 leading-tight">{step.sublabel}</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed"
                          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {step.description}
                        </p>
                        {metric && (
                          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                            <span className="text-xs font-semibold text-emerald-600">{metric}</span>
                          </div>
                        )}
                      </div>
                      {/* Caret arrow */}
                      <div className="absolute w-0 h-0"
                        style={{
                          bottom: -6,
                          ...(i <= 1
                            ? { left: 20 }
                            : i >= STEPS.length - 2
                            ? { right: 20 }
                            : { left: '50%', transform: 'translateX(-50%)' }),
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: '6px solid white',
                        }}
                      />
                    </div>
                  )}

                  {/* Circle */}
                  <button
                    onClick={() => setSelected(prev => prev === i ? null : i)}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    className="relative rounded-full flex items-center justify-center focus:outline-none"
                    style={{
                      width: 76,
                      height: 76,
                      background: bgColor,
                      border: '1px solid rgba(0,0,0,0.04)',
                      boxShadow: isActive
                        ? '0 0 0 3px #6366f1, 0 8px 28px rgba(99,102,241,0.28)'
                        : `0 0 0 2.5px ${ringColor}, 0 4px 16px rgba(0,0,0,0.07)`,
                      transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                      transform: isHovered && !isActive ? 'scale(1.10)' : 'scale(1)',
                    }}
                  >
                    {/* Running ping */}
                    {nodeStatus === 'running' && (
                      <span
                        className="absolute inset-0 rounded-full animate-ping"
                        style={{ background: 'rgba(99,102,241,0.18)', animationDuration: '1.3s' }}
                      />
                    )}
                    {step.icon}
                  </button>

                  {/* Label */}
                  <div className="text-center">
                    <p className="text-xs font-semibold text-gray-700 leading-tight whitespace-nowrap">{step.label}</p>
                    <p className="text-xs text-gray-400 leading-tight whitespace-nowrap">{step.sublabel}</p>
                  </div>

                  {/* Metric badge */}
                  {metric && nodeStatus !== 'idle' && nodeStatus !== 'skipped' && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                      style={{
                        background: nodeStatus === 'success'
                          ? 'rgba(16,185,129,0.10)'
                          : 'rgba(99,102,241,0.10)',
                        color: nodeStatus === 'success' ? '#059669' : '#6366f1',
                      }}
                    >
                      {metric}
                    </span>
                  )}

                  {/* Status check / alert */}
                  <div className="h-4 flex items-center justify-center">
                    {nodeStatus === 'success' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                    {nodeStatus === 'failed'  && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  </div>

                  {/* Failed branch — dashed line + error card */}
                  {nodeStatus === 'failed' && (
                    <div
                      className="absolute flex flex-col items-center"
                      style={{ top: 76, zIndex: 10 }}
                    >
                      <div style={{ width: 2, height: 28, borderLeft: '2px dashed #fca5a5' }} />
                      <div
                        className="bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5 text-center shadow-sm"
                        style={{ minWidth: 130 }}
                      >
                        <p className="text-xs font-bold text-red-600 mb-0.5">Step Failed</p>
                        {errorText
                          ? (
                            <p className="text-xs text-red-400 leading-snug"
                              style={{ maxWidth: 148, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {errorText}
                            </p>
                          )
                          : <p className="text-xs text-red-400">Click node for log</p>
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Connector ── */}
                {i < STEPS.length - 1 && (
                  <div
                    className="relative flex-1 shrink"
                    style={{ marginTop: 38, height: 2, minWidth: 12 }}
                  >
                    {/* Line */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: connectorColor,
                        borderRadius: 2,
                        transition: 'background 0.4s ease',
                      }}
                    />

                    {/* Flowing dots */}
                    {showDots && (
                      <>
                        <div className="flow-dot" style={{ '--dot-color': '#818cf8', animationDelay: '0ms' } as React.CSSProperties} />
                        <div className="flow-dot" style={{ '--dot-color': '#818cf8', animationDelay: '450ms' } as React.CSSProperties} />
                        <div className="flow-dot" style={{ '--dot-color': '#818cf8', animationDelay: '900ms' } as React.CSSProperties} />
                      </>
                    )}

                    {/* Arrowhead */}
                    <svg
                      width="8"
                      height="10"
                      viewBox="0 0 8 10"
                      className="absolute top-1/2 -translate-y-1/2"
                      style={{ right: -1 }}
                    >
                      <path d="M0 0L8 5L0 10" fill={connectorColor} />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Slide-in detail panel ────────────────────────────────────────── */}
      <div className={`detail-panel ${selected !== null ? 'open' : ''}`}>
        {selectedStep && selected !== null && (
          <div className="p-6 h-full flex flex-col">

            {/* Panel header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: getNodeStyle(selectedStatus).bgColor,
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  {selectedStep.icon}
                </div>
                <div>
                  <p className="font-bold text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
                    {selectedStep.label}
                  </p>
                  <p className="text-xs text-gray-400">{selectedStep.sublabel}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-300 hover:text-gray-600 transition-colors mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status badge */}
            <span className={`badge self-start mb-5 ${
              selectedStatus === 'success' ? 'bg-emerald-50 text-emerald-700' :
              selectedStatus === 'failed'  ? 'bg-red-50 text-red-600' :
              selectedStatus === 'running' ? 'bg-indigo-50 text-indigo-600' :
              selectedStatus === 'skipped' ? 'bg-gray-100 text-gray-400' :
              'bg-gray-100 text-gray-500'
            }`}>
              {selectedStatus === 'running'
                ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />RUNNING</span>
                : selectedStatus.toUpperCase()}
            </span>

            {/* Panel body */}
            <div className="space-y-5 flex-1 overflow-y-auto pr-1">

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{selectedStep.description}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Input → Output</p>
                <p className="text-xs text-gray-600 font-mono bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100 leading-relaxed">
                  {selectedStep.inputOutput}
                </p>
              </div>

              {getMetric(log, selectedStep.logMarker, STEPS[selected + 1]?.logMarker) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Processed</p>
                  <p className="text-3xl font-bold text-indigo-600" style={{ fontFamily: 'var(--font-heading)' }}>
                    {getMetric(log, selectedStep.logMarker, STEPS[selected + 1]?.logMarker)}
                  </p>
                </div>
              )}

              {startedAt && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Run Info</p>
                  <p className="text-sm text-gray-600">{new Date(startedAt).toLocaleString()}</p>
                  {durationSec !== null && (
                    <p className="text-xs text-gray-400 mt-0.5">Total pipeline: {durationSec}s</p>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Log</p>
                <pre
                  className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3.5 border border-gray-100 whitespace-pre-wrap leading-relaxed"
                  style={{ fontFamily: 'monospace', maxHeight: 320, overflowY: 'auto' }}
                >
                  {log
                    ? extractLogSegment(log, selectedStep.logMarker, STEPS[selected + 1]?.logMarker)
                    : 'No log yet. Run the pipeline to see step output here.'}
                </pre>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {selected !== null && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
          onClick={() => setSelected(null)}
        />
      )}
    </div>
  )
}
