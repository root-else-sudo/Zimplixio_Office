'use client'

import { forwardRef } from 'react'

export const CODE_LENGTH = 6

export type CodeStatus = 'idle' | 'verifying' | 'success' | 'error'

const STATUS_ANNOUNCEMENT: Record<CodeStatus, string> = {
  idle: '',
  verifying: 'Checking your code…',
  success: 'Code verified.',
  error: 'That code didn’t match.',
}

/**
 * 6-digit one-time-code input.
 *
 * One real <input> (transparent, layered over the boxes) handles typing,
 * paste, OS autofill (`autocomplete="one-time-code"`) and the numeric phone
 * keypad; the six boxes are just its visual rendering. The same six box
 * elements morph through every status — row while typing, a 3×2 "circuit"
 * while verifying, a collapse into a green check on success, a shake on
 * error — all driven by `data-status` in src/styles/auth.css.
 *
 * The parent owns the value and status; `onComplete` fires when the
 * sixth digit lands.
 */
export const CodeInput = forwardRef<
  HTMLInputElement,
  {
    value: string
    status: CodeStatus
    onChange: (value: string) => void
    onComplete: (code: string) => void
    label?: string
  }
>(function CodeInput({ value, status, onChange, onComplete, label = '6-digit code' }, ref) {
  const locked = status === 'verifying' || status === 'success'

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
    onChange(next)
    if (next.length === CODE_LENGTH && value.length !== CODE_LENGTH) onComplete(next)
  }

  return (
    <div className="code-input" data-status={status}>
      <input
        ref={ref}
        className="code-input-native"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={value}
        onChange={handleChange}
        readOnly={locked}
        aria-label={label}
        aria-describedby="code-input-status"
      />

      {/* Connections between the 3×2 grid positions, drawn while verifying. */}
      <svg className="code-circuit" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="0" x2="50" y2="0" pathLength={1} />
        <line x1="50" y1="0" x2="100" y2="0" pathLength={1} />
        <line x1="0" y1="100" x2="50" y2="100" pathLength={1} />
        <line x1="50" y1="100" x2="100" y2="100" pathLength={1} />
        <line x1="0" y1="0" x2="0" y2="100" pathLength={1} />
        <line x1="50" y1="0" x2="50" y2="100" pathLength={1} />
        <line x1="100" y1="0" x2="100" y2="100" pathLength={1} />
      </svg>

      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const digit = value[i]
        const active = status === 'idle' && i === Math.min(value.length, CODE_LENGTH - 1) && value.length < CODE_LENGTH
        return (
          <div
            key={i}
            className="code-box"
            data-index={i}
            data-filled={digit ? true : undefined}
            data-active={active || undefined}
            aria-hidden="true"
          >
            {digit && <span className="code-digit">{digit}</span>}
          </div>
        )
      })}

      <div className="code-check" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
        </svg>
      </div>

      <p id="code-input-status" className="sr-only-live" aria-live="polite">
        {STATUS_ANNOUNCEMENT[status]}
      </p>
    </div>
  )
})
