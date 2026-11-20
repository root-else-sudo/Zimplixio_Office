'use client'

import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'

type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon: LucideIcon
  /** Adds a show/hide toggle (for password fields). */
  revealable?: boolean
  /** Warns while Caps Lock is on (for password fields). */
  capsLockWarning?: boolean
}

/**
 * Labeled input for the dark auth screens, with a leading icon and optional
 * password helpers (show/hide, Caps Lock warning). The label is linked to the
 * input (htmlFor/id). Styling: `.auth-field`, `.auth-input*` in
 * src/styles/auth.css.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, icon: Icon, id, type, revealable, capsLockWarning, onKeyDown, onKeyUp, onBlur, ...inputProps },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const noteId = `${inputId}-note`

  const [revealed, setRevealed] = useState(false)
  const [capsOn, setCapsOn] = useState(false)

  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    if (capsLockWarning) setCapsOn(e.getModifierState('CapsLock'))
  }

  return (
    <div className="auth-field">
      <label htmlFor={inputId} className="auth-label">
        {label}
      </label>
      <div className="auth-input-wrap" data-revealable={revealable || undefined}>
        <Icon className="auth-input-icon" aria-hidden="true" />
        <input
          ref={ref}
          id={inputId}
          className="auth-input"
          type={revealable && revealed ? 'text' : type}
          aria-describedby={capsOn ? noteId : undefined}
          onKeyDown={(e) => {
            trackCaps(e)
            onKeyDown?.(e)
          }}
          onKeyUp={(e) => {
            trackCaps(e)
            onKeyUp?.(e)
          }}
          onBlur={(e) => {
            setCapsOn(false)
            onBlur?.(e)
          }}
          {...inputProps}
        />
        {revealable && (
          <button
            type="button"
            className="auth-input-reveal"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            aria-controls={inputId}
          >
            {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        )}
      </div>
      {capsOn && (
        <p id={noteId} className="auth-field-note" role="status">
          Caps Lock is on
        </p>
      )}
    </div>
  )
})
