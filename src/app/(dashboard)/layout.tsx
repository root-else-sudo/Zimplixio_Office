import { SessionProvider } from 'next-auth/react'
import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto" style={{ background: '#f1f3f7' }}>
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
