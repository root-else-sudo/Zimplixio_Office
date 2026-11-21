import Link from 'next/link'
import { ZimplixioMark } from '@/components/brand/ZimplixioMark'
import PortalSignOutButton from '@/components/shell/PortalSignOutButton'

// Client chrome: a slim top bar, no department sidebar.
export default function PortalShell({
  companyName,
  children,
}: {
  companyName: string
  children: React.ReactNode
}) {
  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <div className="portal-brand">
          <ZimplixioMark size={28} />
          <span className="portal-company">{companyName}</span>
        </div>
        <nav className="portal-actions">
          <Link href="/settings" className="portal-link">Settings</Link>
          <PortalSignOutButton />
        </nav>
      </header>
      <main className="portal-main">{children}</main>
    </div>
  )
}
