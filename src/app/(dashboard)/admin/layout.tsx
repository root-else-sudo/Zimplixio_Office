import SectionTabs from '@/components/ui/SectionTabs'
import { requirePlatformAdmin } from '@/lib/guards'

export const dynamic = 'force-dynamic'

const TABS = [
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/activity', label: 'Activity log' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin()
  return (
    <div className="admin-page">
      <div>
        <p className="eyebrow">Platform</p>
        <h1 className="admin-title">Administration</h1>
        <p className="admin-subtitle">Companies, accounts and access across Zimplixio Office.</p>
      </div>
      <SectionTabs tabs={TABS} />
      {children}
    </div>
  )
}
