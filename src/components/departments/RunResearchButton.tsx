'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 4_000
const MAX_POLL_MS = 3 * 60 * 1000
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'failed'])

export default function RunResearchButton() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'polling' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function pollJob(jobId: string) {
    const startedAt = Date.now()

    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        if (pollRef.current) clearInterval(pollRef.current)
        setStatus('done')
        setMessage('Still running — refresh the page in a bit to check for new candidates.')
        return
      }

      try {
        const res = await fetch(`/api/research/run/${jobId}`)
        if (!res.ok) return // transient — keep polling
        const data = await res.json()
        if (TERMINAL_STATES.has(data.state)) {
          if (pollRef.current) clearInterval(pollRef.current)
          setStatus('done')
          setMessage(
            data.state === 'completed'
              ? 'Run complete — new candidates (if any) are listed below.'
              : 'Run did not complete successfully.'
          )
          router.refresh()
        }
      } catch {
        // transient network hiccup — keep polling, MAX_POLL_MS bounds it
      }
    }, POLL_INTERVAL_MS)
  }

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
      setStatus('polling')
      setMessage('Queued — this page will update automatically once it finishes.')
      pollJob(data.jobId)
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
        disabled={status === 'loading' || status === 'polling'}
      >
        {status === 'loading' ? 'Starting…' : status === 'polling' ? 'Running…' : 'Run now'}
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
