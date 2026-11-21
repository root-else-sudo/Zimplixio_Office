import Sidebar from '@/components/Sidebar'
import { prisma } from '@/lib/prisma'
import { getActiveSession } from '@/lib/session-guard'

// Staff chrome: department sidebar + scrolling main area.
export default async function StaffShell({ children }: { children: React.ReactNode }) {
  const departments = await prisma.department.findMany({
    orderBy: { order: 'asc' },
    select: { key: true, name: true, status: true },
  })

  const session = await getActiveSession()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar departments={departments} isPlatformAdmin={session?.isPlatformAdmin ?? false} />
      <main className="flex-1 overflow-y-auto bg-canvas">{children}</main>
    </div>
  )
}
