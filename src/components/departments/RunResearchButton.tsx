'use client'

import { useState } from 'react'

export default function RunResearchButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleClick() {
    setStatus('loading')
    setMessage(null)
    try {
      const res = await fetch('/api/research/run', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Failed to start run')
        return
      }
      setStatus('queued')
      setMessage('Queued — check back in a few minutes for new candidates.')
    } catch {
      setStatus('error')
      setMessage('Failed to start run')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn-outline shrink-0"
        onClick={handleClick}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Starting…' : 'Run now'}
      </button>
      {message && (
        <p
          className="text-xs max-w-xs text-right"
          style={{ color: status === 'error' ? 'var(--error)' : 'var(--gray-600)' }}
        >
          {message}
        </p>
      )}
    </div>
  )
}
