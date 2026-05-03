'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Edit3, Save, X, RefreshCw, Loader2, AlertCircle } from 'lucide-react'

type Post = {
  id: string
  newsletter: string
  sourceSubject: string
  sourceDate: string
  content: string
  status: string
}

type RejectState = {
  postId: string
  step: 'analyzing' | 'picking' | 'regenerating' | 'comparing'
  options: string[]
  selected: string[]
  freeText: string
  newContent: string
}

export default function PostsClient({ posts: initial }: { posts: Post[] }) {
  const [posts, setPosts] = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED'>('ALL')
  const [reject, setReject] = useState<RejectState | null>(null)

  const filtered = posts.filter((p) => filter === 'ALL' || p.status === filter)

  async function updatePost(id: string, patch: Partial<Post>) {
    const res = await fetch(`/api/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)))
    }
  }

  async function deletePost(id: string) {
    await fetch(`/api/posts/${id}`, { method: 'DELETE' })
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }

  function startEdit(post: Post) {
    setEditing(post.id)
    setEditContent(post.content)
  }

  async function saveEdit(id: string) {
    await updatePost(id, { content: editContent })
    setEditing(null)
  }

  // ── Rejection flow ────────────────────────────────────────────────────────

  async function startReject(post: Post) {
    setReject({ postId: post.id, step: 'analyzing', options: [], selected: [], freeText: '', newContent: '' })

    const res = await fetch(`/api/posts/${post.id}/analyze`, { method: 'POST' })
    const data = await res.json()

    setReject((prev) => prev && ({ ...prev, step: 'picking', options: data.options ?? [] }))
  }

  function toggleOption(option: string) {
    setReject((prev) => {
      if (!prev) return prev
      const already = prev.selected.includes(option)
      return {
        ...prev,
        selected: already ? prev.selected.filter((o) => o !== option) : [...prev.selected, option],
      }
    })
  }

  async function regenerate() {
    if (!reject) return
    setReject((prev) => prev && ({ ...prev, step: 'regenerating' }))

    const res = await fetch(`/api/posts/${reject.postId}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedOptions: reject.selected, freeText: reject.freeText }),
    })
    const data = await res.json()

    setReject((prev) => prev && ({ ...prev, step: 'comparing', newContent: data.content ?? '' }))
  }

  async function pickVersion(keep: 'original' | 'new') {
    if (!reject) return
    const post = posts.find((p) => p.id === reject.postId)
    if (!post) return

    if (keep === 'new') {
      await updatePost(reject.postId, { content: reject.newContent, status: 'DRAFT' })
    }
    // either way, close the modal — original stays or gets updated content
    setReject(null)
  }

  async function confirmDelete() {
    if (!reject) return
    await deletePost(reject.postId)
    setReject(null)
  }

  const draftCount = posts.filter((p) => p.status === 'DRAFT').length

  return (
    <div className="p-7 md:p-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div>
            <p className="eyebrow">Marketing</p>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>Posts</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {draftCount} draft{draftCount !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
          {(['ALL', 'DRAFT', 'APPROVED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs font-semibold px-4 py-2 rounded-lg transition-all"
              style={{
                background: filter === f ? 'var(--indigo-600)' : 'transparent',
                color: filter === f ? '#fff' : '#9ca3af',
                boxShadow: filter === f ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No posts here yet.</div>
        )}

        {filtered.map((post) => (
          <div
            key={post.id}
            className={`soft-card ${post.status === 'APPROVED' ? '!border-emerald-200' : ''}`}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {post.newsletter}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(post.sourceDate).toLocaleDateString()}
                </span>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  post.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {post.status}
              </span>
            </div>

            <div className="px-5 py-4">
              {editing === post.id ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  className="w-full text-sm text-gray-800 leading-relaxed whitespace-pre-wrap border border-indigo-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none "
                />
              ) : (
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ">
                  {post.content}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              {editing === post.id ? (
                <>
                  <button
                    onClick={() => saveEdit(post.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </>
              ) : (
                <>
                  {post.status === 'DRAFT' && (
                    <button
                      onClick={() => updatePost(post.id, { status: 'APPROVED' })}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {post.status === 'APPROVED' && (
                    <button
                      onClick={() => updatePost(post.id, { status: 'DRAFT' })}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Move to draft
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(post)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => startReject(post)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors ml-auto"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Rejection modal ─────────────────────────────────────────────────── */}
      {reject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            {/* Analyzing */}
            {reject.step === 'analyzing' && (
              <div className="flex flex-col items-center justify-center py-16 px-8 gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-sm font-medium text-gray-700">Analyzing the post…</p>
              </div>
            )}

            {/* Picking options */}
            {reject.step === 'picking' && (
              <div className="p-6">
                <div className="flex items-start justify-between mb-1">
                  <h2 className="font-bold tracking-tight font-bold text-lg text-gray-900">
                    What's off about this post?
                  </h2>
                  <button onClick={() => setReject(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-5">
                  Pick one or more directions, then add any extra context below.
                </p>

                <div className="space-y-2 mb-5">
                  {reject.options.map((opt) => {
                    const active = reject.selected.includes(opt)
                    return (
                      <button
                        key={opt}
                        onClick={() => toggleOption(opt)}
                        className={`w-full text-left text-sm px-4 py-3 rounded-xl border transition-colors ${
                          active
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-medium'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Add context (optional)
                  </label>
                  <textarea
                    value={reject.freeText}
                    onChange={(e) => setReject((prev) => prev && ({ ...prev, freeText: e.target.value }))}
                    rows={3}
                    placeholder="Anything else the agent should know…"
                    className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={regenerate}
                    disabled={reject.selected.length === 0 && !reject.freeText.trim()}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-4 h-4" /> Regenerate
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-700 px-4 py-2.5 rounded-xl hover:bg-red-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Just delete it
                  </button>
                </div>
              </div>
            )}

            {/* Regenerating */}
            {reject.step === 'regenerating' && (
              <div className="flex flex-col items-center justify-center py-16 px-8 gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-sm font-medium text-gray-700">Rewriting the post…</p>
              </div>
            )}

            {/* Comparing side by side */}
            {reject.step === 'comparing' && (
              <div className="p-6">
                <div className="flex items-start justify-between mb-1">
                  <h2 className="font-bold tracking-tight font-bold text-lg text-gray-900">
                    Pick a version
                  </h2>
                  <button onClick={() => setReject(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-5">
                  Choose which version to keep as a draft. The other will be discarded.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  {/* Original */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500">Original</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap p-4 ">
                      {posts.find((p) => p.id === reject.postId)?.content}
                    </p>
                    <div className="px-4 py-3 border-t border-gray-100">
                      <button
                        onClick={() => pickVersion('original')}
                        className="w-full text-xs font-semibold text-gray-600 hover:text-gray-900 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Keep original
                      </button>
                    </div>
                  </div>

                  {/* New version */}
                  <div className="border border-indigo-300 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-xs font-semibold text-indigo-600">New version</span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap p-4 ">
                      {reject.newContent}
                    </p>
                    <div className="px-4 py-3 border-t border-indigo-100">
                      <button
                        onClick={() => pickVersion('new')}
                        className="w-full text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg transition-colors"
                      >
                        Use new version
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setReject((prev) => prev && ({ ...prev, step: 'picking' }))}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Go back and change feedback
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
