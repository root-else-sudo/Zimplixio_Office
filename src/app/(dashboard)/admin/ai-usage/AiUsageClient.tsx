'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'

export interface LlmCallRow {
  id: string
  route: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  latencyMs: number
  costUsd: number | null
  success: boolean
  errorCode: string | null
  createdAt: string
}

interface Props {
  calls: LlmCallRow[]
}

interface RouteAggregate {
  route: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  errorRate: number
  cacheHitRate: number
  p50LatencyMs: number
  p95LatencyMs: number
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

function aggregateByRoute(calls: LlmCallRow[]): RouteAggregate[] {
  const groups = new Map<string, LlmCallRow[]>()
  for (const c of calls) {
    if (!groups.has(c.route)) groups.set(c.route, [])
    groups.get(c.route)!.push(c)
  }

  return Array.from(groups.entries())
    .map(([route, rows]) => {
      const errors = rows.filter((r) => !r.success).length
      const cacheTotal = rows.reduce(
        (sum, r) => sum + r.cacheReadTokens + r.cacheCreationTokens,
        0
      )
      const cacheRead = rows.reduce((sum, r) => sum + r.cacheReadTokens, 0)
      const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b)
      return {
        route,
        calls: rows.length,
        inputTokens: rows.reduce((s, r) => s + r.inputTokens, 0),
        outputTokens: rows.reduce((s, r) => s + r.outputTokens, 0),
        cacheCreationTokens: rows.reduce((s, r) => s + r.cacheCreationTokens, 0),
        cacheReadTokens: cacheRead,
        costUsd: rows.reduce((s, r) => s + (r.costUsd ?? 0), 0),
        errorRate: rows.length === 0 ? 0 : errors / rows.length,
        cacheHitRate: cacheTotal === 0 ? 0 : cacheRead / cacheTotal,
        p50LatencyMs: Math.round(quantile(latencies, 0.5)),
        p95LatencyMs: Math.round(quantile(latencies, 0.95)),
      }
    })
    .sort((a, b) => b.costUsd - a.costUsd)
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export default function AiUsageClient({ calls }: Props) {
  const totals = {
    calls: calls.length,
    cost: calls.reduce((s, c) => s + (c.costUsd ?? 0), 0),
    inputTokens: calls.reduce((s, c) => s + c.inputTokens, 0),
    outputTokens: calls.reduce((s, c) => s + c.outputTokens, 0),
    cacheRead: calls.reduce((s, c) => s + c.cacheReadTokens, 0),
    cacheWrite: calls.reduce((s, c) => s + c.cacheCreationTokens, 0),
    errors: calls.filter((c) => !c.success).length,
  }
  const cacheTotal = totals.cacheRead + totals.cacheWrite
  const cacheHitRate = cacheTotal === 0 ? 0 : totals.cacheRead / cacheTotal

  const byRoute = aggregateByRoute(calls)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Usage</h1>
        <p className="text-sm text-gray-500">
          Last {calls.length} Claude calls (max 1,000) over the past 30 days.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Calls" value={totals.calls.toLocaleString()} />
        <Stat label="Total cost" value={formatUsd(totals.cost)} />
        <Stat
          label="Cache hit rate"
          value={`${(cacheHitRate * 100).toFixed(1)}%`}
          hint={
            cacheTotal === 0
              ? 'No cacheable prefix yet — system prompts under the model minimum (~2k tokens for Sonnet, ~4k for Haiku) silently skip the cache. Hit rate will rise once prompts grow (Phase 5 audit context).'
              : undefined
          }
        />
        <Stat
          label="Errors"
          value={`${totals.errors} (${
            totals.calls === 0 ? '0' : ((totals.errors / totals.calls) * 100).toFixed(1)
          }%)`}
        />
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-medium">Cost by route</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byRoute}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="route" />
            <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
            <Tooltip
              formatter={(v) => formatUsd(typeof v === 'number' ? v : Number(v) || 0)}
              labelStyle={{ color: '#111' }}
            />
            <Legend />
            <Bar dataKey="costUsd" fill="#3b82f6" name="USD" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-medium">By route</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2">Route</th>
              <th>Calls</th>
              <th>Input</th>
              <th>Output</th>
              <th>Cache hit</th>
              <th>Cost</th>
              <th>Error</th>
              <th>p50 ms</th>
              <th>p95 ms</th>
            </tr>
          </thead>
          <tbody>
            {byRoute.map((r) => (
              <tr key={r.route} className="border-t">
                <td className="py-2">{r.route}</td>
                <td>{r.calls}</td>
                <td>{formatTokens(r.inputTokens)}</td>
                <td>{formatTokens(r.outputTokens)}</td>
                <td>{(r.cacheHitRate * 100).toFixed(1)}%</td>
                <td>{formatUsd(r.costUsd)}</td>
                <td>{(r.errorRate * 100).toFixed(1)}%</td>
                <td>{r.p50LatencyMs}</td>
                <td>{r.p95LatencyMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-2 text-xs text-gray-400">{hint}</div>}
    </div>
  )
}
