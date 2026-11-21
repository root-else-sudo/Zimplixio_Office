import PortalShell from '@/components/shell/PortalShell'
import { getPortalCompany } from '@/lib/portal'

// Guarded by the DB-backed session on every request — never statically prerender.
export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // getPortalCompany runs requireClient() first (defense in depth with the template).
  const company = await getPortalCompany()
  return <PortalShell companyName={company.name}>{children}</PortalShell>
}
