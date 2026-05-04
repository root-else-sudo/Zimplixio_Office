'use client'

import { useMemo, useState } from 'react'
import { diffWords, type Change } from 'diff'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export interface HistoryVersion {
  id: string
  version: number
  content: string
  source: 'ORIGINAL' | 'REGENERATED' | 'EDITED'
  feedback: Record<string, unknown> | null
  createdBy: string | null
  createdAt: string
}

interface PostMeta {
  id: string
  newsletter: string
  sourceSubject: string
  status: string
  createdAt: string
  approvedAt: string | null
  approvedById: string | null
  rejectedAt: string | null
  rejectedById: string | null
  rejectionReason: string | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function sourceColor(source: HistoryVersion['source']): string {
  switch (source) {
    case 'ORIGINAL':
      return 'bg-gray-100 text-gray-700'
    case 'REGENERATED':
      return 'bg-blue-100 text-blue-700'
    case 'EDITED':
      return 'bg-amber-100 text-amber-800'
  }
}

function DiffView({ left, right }: { left: string; right: string }) {
  const diff: Change[] = useMemo(() => diffWords(left, right), [left, right])
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 leading-relaxed whitespace-pre-wrap font-mono text-sm">
      {diff.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-green-100 text-green-900">
              {part.value}
            </span>
          )
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red-100 text-red-900 line-through">
              {part.value}
            </span>
          )
        }
        return <span key={i}>{part.value}</span>
      })}
    </div>
  )
}

export default function HistoryClient({
  post,
  versions,
}: {
  post: PostMeta
  versions: HistoryVersion[]
}) {
  const [leftId, setLeftId] = useState<string>(versions[0]?.id ?? '')
  const [rightId, setRightId] = useState<string>(
    versions[versions.length - 1]?.id ?? ''
  )

  const left = versions.find((v) => v.id === leftId) ?? null
  const right = versions.find((v) => v.id === rightId) ?? null

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/posts"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" /> Back to posts
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">Version history</h1>
        <p className="text-sm text-gray-500">
          {post.newsletter} · {post.sourceSubject}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Status: {post.status}</span>
          <span>Created: {fmtDate(post.createdAt)}</span>
          {post.approvedAt && (
            <span>
              Approved: {fmtDate(post.approvedAt)}
              {post.approvedById && ` by ${post.approvedById.slice(0, 8)}`}
            </span>
          )}
          {post.rejectedAt && (
            <span>
              Rejected: {fmtDate(post.rejectedAt)}
              {post.rejectedById && ` by ${post.rejectedById.slice(0, 8)}`}
              {post.rejectionReason && ` — ${post.rejectionReason}`}
            </span>
          )}
        </div>
      </header>

      {versions.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">
          No versions recorded for this post yet.
        </div>
      ) : (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-gray-700">Timeline</h2>
            <ol className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
                >
                  <span className="text-xs text-gray-400">v{v.version}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${sourceColor(v.source)}`}>
                    {v.source.toLowerCase()}
                  </span>
                  <span className="text-xs text-gray-500">{fmtDate(v.createdAt)}</span>
                  {v.createdBy && (
                    <span className="text-xs text-gray-400">by {v.createdBy.slice(0, 8)}</span>
                  )}
                  {v.feedback && Object.keys(v.feedback).length > 0 && (
                    <span className="text-xs text-gray-500">
                      feedback:{' '}
                      {Array.isArray((v.feedback as { selectedOptions?: string[] }).selectedOptions)
                        ? `${((v.feedback as { selectedOptions: string[] }).selectedOptions).length} option(s)`
                        : 'see details'}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-medium text-gray-700">Diff</h2>
              <select
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="rounded border border-gray-200 px-2 py-1 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} ({v.source.toLowerCase()})
                  </option>
                ))}
              </select>
              <span className="text-gray-400">→</span>
              <select
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                className="rounded border border-gray-200 px-2 py-1 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} ({v.source.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  v{left?.version ?? '?'} ({left?.source.toLowerCase()})
                </h3>
                <pre className="rounded-lg border border-gray-200 bg-white p-4 text-sm whitespace-pre-wrap font-mono">
                  {left?.content ?? ''}
                </pre>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  v{right?.version ?? '?'} ({right?.source.toLowerCase()})
                </h3>
                <pre className="rounded-lg border border-gray-200 bg-white p-4 text-sm whitespace-pre-wrap font-mono">
                  {right?.content ?? ''}
                </pre>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Inline diff</h3>
              {left && right ? (
                <DiffView left={left.content} right={right.content} />
              ) : (
                <div className="text-sm text-gray-400">Pick two versions to compare.</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
