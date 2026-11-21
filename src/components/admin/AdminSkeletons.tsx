/**
 * Loading placeholders for the admin area, shown by each route's
 * `loading.tsx` the instant a tab or row is clicked. These pages render
 * fresh on every request; without a loading boundary Next.js shows no
 * feedback at all until the server responds.
 * Styling: `.skeleton-*` in src/styles/app.css.
 */

function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`skeleton-bar ${className}`} />
}

/** Placeholder for a list tab: toolbar title + table rows. */
export function AdminTableSkeleton({
  title,
  columns,
  rows = 5,
  showAction = true,
}: {
  title: string
  columns: number
  rows?: number
  /** Placeholder for the toolbar's action button ("New company", "Invite user"). */
  showAction?: boolean
}) {
  return (
    <div className="space-y-6" role="status">
      <span className="sr-only">Loading {title.toLowerCase()}…</span>
      <div className="admin-toolbar">
        <h2 className="admin-section-title">{title}</h2>
        {showAction && <Bar className="skeleton-button" />}
      </div>
      <div className="soft-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, i) => (
                <th key={i}>
                  <Bar className="skeleton-th" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: columns }, (_, c) => (
                  <td key={c}>
                    <Bar className={c === 0 ? 'skeleton-cell-wide' : 'skeleton-cell'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Placeholder for a detail page (company or user): back link + card. */
export function AdminDetailSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-6" role="status">
      <span className="sr-only">Loading {label}…</span>
      <Bar className="skeleton-back" />
      <div className="soft-card admin-card">
        <Bar className="skeleton-heading" />
        <Bar className="skeleton-line" />
        <Bar className="skeleton-line-short" />
        <div className="admin-actions">
          <Bar className="skeleton-button" />
          <Bar className="skeleton-button" />
        </div>
      </div>
    </div>
  )
}
