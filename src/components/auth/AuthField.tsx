import { forwardRef, useId } from 'react'
import type { LucideIcon } from 'lucide-react'

type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon: LucideIcon
}

/**
 * Labeled input for the dark auth screens, with a leading icon.
 * The label is properly linked to the input (htmlFor/id).
 * Styling: `.auth-field`, `.auth-input*` in src/styles/auth.css.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, icon: Icon, id, ...inputProps },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="auth-field">
      <label htmlFor={inputId} className="auth-label">
        {label}
      </label>
      <div className="auth-input-wrap">
        <Icon className="auth-input-icon" aria-hidden="true" />
        <input ref={ref} id={inputId} className="auth-input" {...inputProps} />
      </div>
    </div>
  )
})
