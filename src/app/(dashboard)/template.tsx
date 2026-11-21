import { requireStaff } from '@/lib/guards'

export const dynamic = 'force-dynamic'

// Layouts are NOT re-run on client-side (soft) navigation between sibling pages,
// but templates are. Re-checking the DB-backed session here means a revoked or
// deactivated user is signed out on their next navigation, not the next reload.
export default async function DashboardTemplate({ children }: { children: React.ReactNode }) {
  await requireStaff()
  return <>{children}</>
}
