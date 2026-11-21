import PortalShell from '@/components/shell/PortalShell'
import StaffShell from '@/components/shell/StaffShell'
import { requireSignedIn } from '@/lib/guards'
import { getPortalCompany } from '@/lib/portal'

// Guarded by the DB-backed session on every request — never statically prerender.
export const dynamic = 'force-dynamic'

// Settings is reachable by both account kinds; the chrome follows the account.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const active = await requireSignedIn()
  if (active.accountKind === 'CLIENT') {
    const company = await getPortalCompany()
    return <PortalShell companyName={company.name}>{children}</PortalShell>
  }
  return <StaffShell>{children}</StaffShell>
}
