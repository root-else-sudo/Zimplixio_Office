import { requirePlatformAdmin } from '@/lib/guards'
import { listActivity } from '@/lib/admin/audit'
import { auditLabel } from '@/lib/admin/audit-labels'
import { listCompanies } from '@/lib/admin/companies'
import { listUsers } from '@/lib/admin/users'
import { formatDateTime } from '@/lib/admin/format'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  await requirePlatformAdmin()
  const [rows, companies, users] = await Promise.all([listActivity({ limit: 100 }), listCompanies(), listUsers()])
  const companyName = new Map(companies.map(c => [c.id, c.name]))
  const userName = new Map(users.map(u => [u.id, u.name]))

  function target(r: (typeof rows)[number]): string {
    if (r.targetType === 'Company') return companyName.get(r.targetId) ?? 'Company'
    return userName.get(r.targetId) ?? 'User'
  }

  return (
    <div className="space-y-5">
      <div className="admin-toolbar">
        <h2 className="admin-section-title">Activity log</h2>
        <p className="admin-note">Newest 100 entries</p>
      </div>
      <div className="soft-card admin-table-wrap">
        {rows.length === 0 ? (
          <p className="admin-empty">No activity yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="admin-muted">{formatDateTime(r.createdAt)}</td>
                  <td>{r.actorName ?? 'Unknown (removed user)'}</td>
                  <td>{auditLabel(r.action)}</td>
                  <td>{target(r)}</td>
                  <td>{r.companyId ? (companyName.get(r.companyId) ?? '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
