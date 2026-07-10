'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LogOut, FlaskConical, Wrench, Megaphone, TrendingUp, DollarSign, Settings2, Settings,
  type LucideIcon,
} from 'lucide-react'
import { departmentSlug } from '@/lib/departments'
import type { DepartmentKey, DepartmentStatus } from '@prisma/client'

export type SidebarDepartment = {
  key: DepartmentKey
  name: string
  status: DepartmentStatus
}

const DEPARTMENT_ICONS: Record<DepartmentKey, LucideIcon> = {
  PRODUCT_RESEARCH: FlaskConical,
  ENGINEERING: Wrench,
  MARKETING: Megaphone,
  SALES: TrendingUp,
  FINANCE: DollarSign,
  OPERATIONS: Settings2,
}

function ZimplixioMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" overflow="visible" aria-hidden="true">
      <circle cx="200" cy="200" r="160" stroke="#C68A4E" strokeWidth="16" fill="none" />
      <path d="M 313,220 A 115,115 0 1,1 288,126 L 362,126 L 362,176 L 250,176 A 65,65 0 1,0 264,211 Z" fill="#2E7D32" />
      <polyline points="183,183 168,200 183,217" stroke="#C68A4E" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="217,183 232,200 217,217" stroke="#C68A4E" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar({ departments }: { departments: SidebarDepartment[] }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const userName = session?.user?.name ?? session?.user?.email ?? 'User'
  const userRole = session?.user?.role ?? ''

  return (
    <aside className="flex flex-col h-full w-64 shrink-0" style={{ background: 'var(--navy-800)' }}>

      {/* Logo header */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <ZimplixioMark size={30} />
          <div>
            <p className="font-bold text-white text-base leading-none tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              Zimplixio
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--navy-text-muted)', letterSpacing: '0.1em' }}>OFFICE</p>
          </div>
        </div>
      </div>

      {/* Departments — the org chart */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto">
        <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--navy-text-muted)' }}>
          Departments
        </p>
        <div className="space-y-0.5">
          {departments.map(({ key, name, status }) => {
            const slug = departmentSlug(key)
            const href = `/departments/${slug}`
            const active = pathname === href
            const reserved = status === 'RESERVED'
            const Icon = DEPARTMENT_ICONS[key]
            return (
              <Link
                key={key}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative"
                style={{
                  background: active ? 'var(--navy-700)' : undefined,
                  color: active ? '#fff' : reserved ? 'var(--navy-text-muted)' : 'rgba(255,255,255,0.75)',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--navy-600)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: 'var(--green-600)' }} />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                {name}
                {reserved && (
                  <span
                    aria-label="Reserved seat"
                    className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'var(--copper-500)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Bottom — user + sign out */}
      <div className="px-3 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 px-3 py-3 mt-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--green-600), var(--green-700))' }}>
            {initials(userName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">{userName}</p>
            <p className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.35)' }}>{userRole.toLowerCase()}</p>
          </div>
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-colors"
          style={{ color: pathname === '/settings' ? '#fff' : 'rgba(255,255,255,0.4)', background: pathname === '/settings' ? 'var(--navy-700)' : undefined }}
          onMouseEnter={e => { if (pathname !== '/settings') (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)' }}
          onMouseLeave={e => { if (pathname !== '/settings') (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)' }}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-colors"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
