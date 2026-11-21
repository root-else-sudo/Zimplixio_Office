import StaffShell from '@/components/shell/StaffShell'
import { requireStaff } from '@/lib/guards'

// DB-backed on every request (guard + department nav) — never statically prerender.
export const dynamic = 'force-dynamic'

// SessionProvider lives in the root layout so it covers auth pages too.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireStaff()
  return <StaffShell>{children}</StaffShell>
}
