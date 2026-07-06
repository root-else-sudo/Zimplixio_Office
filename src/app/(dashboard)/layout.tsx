import Sidebar from '@/components/Sidebar'
import { prisma } from '@/lib/prisma'

// DB-backed on every request (department nav) — never statically prerender.
export const dynamic = 'force-dynamic'

// SessionProvider lives in the root layout so it covers auth pages too.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const departments = await prisma.department.findMany({
    orderBy: { order: 'asc' },
    select: { key: true, name: true, status: true },
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar departments={departments} />
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--canvas)' }}>
        {children}
      </main>
    </div>
  )
}
