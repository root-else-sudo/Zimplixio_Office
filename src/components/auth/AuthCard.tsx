import { ZimplixioMark } from '@/components/brand/ZimplixioMark'

/**
 * Glass card used by every auth screen: brand row, title, optional subtitle,
 * then the page's own content. `tone="success"` floods it with forest green
 * (MFA verified). Styling: `.auth-card*` in src/styles/auth.css.
 */
export function AuthCard({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  tone?: 'success'
  children: React.ReactNode
}) {
  return (
    <section className="auth-card" data-tone={tone} aria-labelledby="auth-title">
      <div className="auth-brand">
        <ZimplixioMark size={30} />
        <p className="auth-brand-name">
          Zimplixio <span>Office</span>
        </p>
      </div>
      <h1 id="auth-title" className="auth-title">{title}</h1>
      {subtitle && <p className="auth-subtitle">{subtitle}</p>}
      <div className="auth-body">{children}</div>
    </section>
  )
}

/** Inline error message for auth forms, announced to screen readers. */
export function AuthAlert({ children }: { children: React.ReactNode }) {
  return (
    <p className="auth-alert" role="alert">
      {children}
    </p>
  )
}
