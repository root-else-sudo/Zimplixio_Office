import Sidebar from '@/components/Sidebar'
import { prisma } from '@/lib/prisma'

// Staff chrome: department sidebar + scrolling main area.
export default async function StaffShell({ children }: { children: React.ReactNode }) {
  const departments = await prisma.department.findMany({
    orderBy: { order: 'asc' },
    select: { key: true, name: true, status: true },
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar departments={departments} />
      <main className="flex-1 overflow-y-auto bg-canvas">{children}</main>
    </div>
  )
}
