'use client'

import { useState, useEffect, useRef } from 'react'
import {
  FileText, CheckCircle, Play, AlertCircle,
  Loader2, X, TrendingUp, Zap,
  Activity, Bot, Clock, Calendar,
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

type AgentRun = {
  id: string
  status: string
  startedAt: string
  finishedAt: string | null
  _count: { posts: number }
}

type Agent = {
  id: string
  name: string
  description: string
  isActive: boolean
  cronSchedule: string
  runs: AgentRun[]
}

type ChartWeek = {
  week: string
  posts: number
  success: number
  failed: number
}

type Props = {
  stats: { totalDrafts: number; totalApproved: number }
  agents: Agent[]
  chartData: ChartWeek[]
  weeklyRunCount: number
  successRate: number
  isAdmin: boolean
}

type PipelineState =
  | { phase: 'idle' }
  | { phase: 'running'; runId: string; elapsed: number }
  | { phase: 'done'; postCount: number }
  | { phase: 'error'; message: string }

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

// Custom recharts tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function OverviewClient({
  stats: initialStats, agents,
  chartData, weeklyRunCount, successRate, isAdmin,
}: Props) {
  const [pipeline, setPipeline] = useState<PipelineState>({ phase: 'idle' })
  const [stats, setStats] = useState(initialStats)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearWatchers() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (timerRef.current) clearInterval(timerRef.current)
  }
  useEffect(() => () => clearWatchers(), [])

  async function triggerPipeline() {
    setPipeline({ phase: 'running', runId: '', elapsed: 0 })
    const res = await fetch('/api/pipeline', { method: 'POST' })
    if (!res.ok) {
      // 409 means another run is already in flight (singleton lock).
      const msg = res.status === 409
        ? 'A pipeline run is already in progress.'
        : 'Failed to start pipeline.'
      setPipeline({ phase: 'error', message: msg })
      return
    }

    const { runId } = await res.json()
    setPipeline({ phase: 'running', runId, elapsed: 0 })

    timerRef.current = setInterval(() => {
      setPipeline(prev => prev.phase === 'running' ? { ...prev, elapsed: prev.elapsed + 1 } : prev)
    }, 1000)

    // Subscribe to the SSE event stream. The server emits a `status` event on
    // every status transition and closes the stream on terminal status.
    const es = new EventSource(`/api/pipeline/${runId}/events`)
    eventSourceRef.current = es

    es.addEventListener('status', async (ev) => {
      try {
        const { status } = JSON.parse((ev as MessageEvent).data) as { status: string }
        if (status !== 'SUCCESS' && status !== 'FAILED') return
        clearWatchers()

        if (status === 'SUCCESS') {
          // SSE doesn't carry postCount — fetch it once we know the run ended.
          const data = await fetch(`/api/pipeline/${runId}`).then(r => r.json())
          setPipeline({ phase: 'done', postCount: data.postCount ?? 0 })
          const s = await fetch('/api/stats')
          if (s.ok) setStats(await s.json())
        } else {
          setPipeline({ phase: 'error', message: 'Pipeline failed. Click a node to see the log.' })
        }
      } catch {
        /* parse error — ignore, terminal status will fire again or onerror handles it */
      }
    })

    es.onerror = () => {
      // Server closed the stream cleanly OR network drop. The status handler
      // already cleared on terminal status; this handles abnormal disconnects.
      if (es.readyState === EventSource.CLOSED) {
        clearWatchers()
      }
    }
  }

  return (
    <div className="p-7 md:p-10 max-w-6xl mx-auto space-y-7">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Marketing</p>
          <h1 className="text-3xl font-bold tracking-tight leading-tight text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
            Overview
          </h1>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3 mt-1">
            <button onClick={triggerPipeline} disabled={pipeline.phase === 'running'} className="btn-primary">
              {pipeline.phase === 'running'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Running… {fmt(pipeline.phase === 'running' ? (pipeline as any).elapsed : 0)}</>
                : <><Play className="w-4 h-4" /> Run Pipeline</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Pipeline banners */}
      {pipeline.phase === 'done' && (
        <div className="soft-card px-5 py-4 flex items-center gap-3 border-l-4 border-emerald-400">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-700">Pipeline complete</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {pipeline.postCount} new draft{pipeline.postCount !== 1 ? 's' : ''} ready.{' '}
              <Link href="/posts" className="underline font-medium">Go to Posts →</Link>
            </p>
          </div>
          <button onClick={() => setPipeline({ phase: 'idle' })} className="text-gray-300 hover:text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pipeline.phase === 'error' && (
        <div className="soft-card px-5 py-4 flex items-center gap-3 border-l-4 border-red-400">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{(pipeline as any).message}</p>
          <button onClick={() => setPipeline({ phase: 'idle' })} className="text-gray-300 hover:text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI chips */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Drafts', value: stats.totalDrafts, icon: <FileText className="w-4 h-4" />, color: '#f59e0b', bg: '#fef3c7', href: '/posts' },
          { label: 'Approved', value: stats.totalApproved, icon: <CheckCircle className="w-4 h-4" />, color: '#10b981', bg: '#d1fae5', href: '/posts' },
          { label: 'Runs this week', value: weeklyRunCount, icon: <Activity className="w-4 h-4" />, color: '#6366f1', bg: '#e0e7ff', href: null },
          { label: 'Success rate', value: `${successRate}%`, icon: <TrendingUp className="w-4 h-4" />, color: '#3b82f6', bg: '#dbeafe', href: null },
        ].map((kpi) => (
          kpi.href
            ? <Link key={kpi.label} href={kpi.href} className="stat-chip flex items-center gap-3 soft-card-hover cursor-pointer">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: kpi.bg, color: kpi.color }}>
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>{kpi.value}</p>
                  <p className="text-xs text-gray-400">{kpi.label}</p>
                </div>
              </Link>
            : <div key={kpi.label} className="stat-chip flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: kpi.bg, color: kpi.color }}>
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>{kpi.value}</p>
                  <p className="text-xs text-gray-400">{kpi.label}</p>
                </div>
              </div>
        ))}
      </div>

      {/* Agents — compact strip */}
      <div className="soft-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <p className="text-sm font-semibold text-gray-800" style={{ fontFamily: 'var(--font-heading)' }}>Agents</p>
          </div>
          <Link href="/agents" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors">
            View all →
          </Link>
        </div>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-4">No agents yet. Run the pipeline to register one.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${agent.isActive ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <p className="text-sm font-medium text-gray-800">{agent.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">{agent.cronSchedule}</span>
                  <span className={`badge ${agent.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-5">

        {/* Posts per week */}
        <div className="dark-card p-6">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Posts generated</p>
          <p className="text-lg font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Per Week</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="posts" fill="#6366f1" radius={[6,6,0,0]} name="Posts" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline run history */}
        <div className="dark-card p-6">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pipeline runs</p>
          <p className="text-lg font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Success vs Failed</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }} />
              <Line type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} name="Success" />
              <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} name="Failed" />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Agent detail modal */}
      {selectedAgent && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setSelectedAgent(null)}
          />
          <div
            className="fixed z-50 bg-white rounded-3xl shadow-2xl overflow-hidden"
            style={{
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(680px, calc(100vw - 48px))',
              maxHeight: 'calc(100vh - 80px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
                      {selectedAgent.name}
                    </p>
                    <span className={`badge ${selectedAgent.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {selectedAgent.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedAgent.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono text-gray-500">{selectedAgent.cronSchedule}</span>
                </div>
                <button onClick={() => setSelectedAgent(null)} className="text-gray-300 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* KPI strip */}
            {(() => {
              const runs  = selectedAgent.runs
              const total = runs.length
              const succ  = runs.filter(r => r.status === 'SUCCESS').length
              const rate  = total > 0 ? Math.round((succ / total) * 100) : 0
              const posts = runs.reduce((s, r) => s + r._count.posts, 0)
              const durs  = runs.filter(r => r.finishedAt).map(r =>
                new Date(r.finishedAt!).getTime() - new Date(r.startedAt).getTime()
              )
              const avgMs = durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0
              const fd    = (ms: number) => { const s = Math.round(ms / 1000); const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s` }
              return (
                <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shrink-0">
                  {[
                    { icon: <Activity className="w-4 h-4" />,    label: 'Total runs',    value: total,              color: '#6366f1', bg: '#eef2ff' },
                    { icon: <CheckCircle className="w-4 h-4" />, label: 'Success rate',  value: `${rate}%`,         color: '#10b981', bg: '#d1fae5' },
                    { icon: <Zap className="w-4 h-4" />,         label: 'Posts created', value: posts,              color: '#f59e0b', bg: '#fef3c7' },
                    { icon: <Clock className="w-4 h-4" />,       label: 'Avg duration',  value: avgMs > 0 ? fd(avgMs) : '—', color: '#3b82f6', bg: '#dbeafe' },
                  ].map((kpi) => (
                    <div key={kpi.label} className="px-5 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: kpi.bg, color: kpi.color }}>
                        {kpi.icon}
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900 leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>{kpi.value}</p>
                        <p className="text-xs text-gray-400">{kpi.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Runs table */}
            <div className="px-7 py-5 overflow-y-auto flex-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Recent Runs</p>
              {selectedAgent.runs.length === 0 ? (
                <p className="text-sm text-gray-400">No runs yet.</p>
              ) : (
                <div className="space-y-0.5">
                  {selectedAgent.runs.map((run) => {
                    const dur = run.finishedAt
                      ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
                      : null
                    const fd = (ms: number) => { const s = Math.round(ms / 1000); const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s` }
                    return (
                      <div key={run.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          {run.status === 'SUCCESS' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                          {run.status === 'FAILED'  && <AlertCircle className="w-4 h-4 text-red-400" />}
                          {run.status === 'RUNNING' && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                          <p className="text-sm text-gray-700">
                            {new Date(run.startedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {' '}<span className="text-gray-400">{new Date(run.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          {run._count.posts > 0 && (
                            <span className="text-xs font-semibold text-indigo-500">{run._count.posts} post{run._count.posts !== 1 ? 's' : ''}</span>
                          )}
                          {dur !== null && (
                            <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">{fd(dur)}</span>
                          )}
                          <span className="text-xs text-gray-400">{timeAgo(run.startedAt)}</span>
                          <span className={`badge ${
                            run.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' :
                            run.status === 'FAILED'  ? 'bg-red-50 text-red-500' :
                            'bg-indigo-50 text-indigo-600'
                          }`}>{run.status}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
