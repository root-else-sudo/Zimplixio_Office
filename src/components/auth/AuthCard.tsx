import { ZimplixioMark } from '@/components/brand/ZimplixioMark'

/**
 * Glass card used by every auth screen: brand row, title, optional subtitle,
 * the page's content, and an optional footer (help / trust / account
 * links). `tone="success"` floods it with forest green (MFA verified).
 * Styling: `.auth-card*` in src/styles/auth.css.
 */
export function AuthCard({
  title,
  subtitle,
  tone,
  footer,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  tone?: 'success'
  footer?: React.ReactNode
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
      {footer && <footer className="auth-card-footer">{footer}</footer>}
    </section>
  )
}

/**
 * Inline message on an auth card. `error` for something that went wrong
 * (announced immediately); `info` for neutral context, like a session that
 * ended. Styling: `.auth-message` in src/styles/auth.css.
 */
export function AuthMessage({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className="auth-message" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

/** Shorthand for an error message, used by every auth form. */
export function AuthAlert({ children }: { children: React.ReactNode }) {
  return <AuthMessage tone="error">{children}</AuthMessage>
}

/** One line in a card footer, with an optional leading icon. */
export function AuthFooterLine({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="auth-footer-line">
      {Icon && <Icon className="auth-footer-icon" aria-hidden="true" />}
      <span>{children}</span>
    </p>
  )
}
