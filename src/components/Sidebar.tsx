'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, FileText, Bot, CalendarDays,
  LogOut, Bell, BellOff, Megaphone, Lightbulb, Sparkles,
  FolderKanban,
  type LucideIcon,
} from 'lucide-react'
import { clientEnv } from '@/lib/env-client'

type NavItem = { href: string; label: string; icon: LucideIcon; disabled?: boolean }
type NavGroup = { label: string; items: NavItem[]; adminOnly?: boolean }

const navGroups: NavGroup[] = [
  {
    label: 'Marketing',
    items: [
      { href: '/',         label: 'Overview', icon: LayoutDashboard },
      { href: '/posts',    label: 'Posts',    icon: FileText },
      { href: '/agents',   label: 'Pipeline', icon: Bot },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/opportunities', label: 'Opportunities', icon: Lightbulb },
      { href: '#', label: 'More coming', icon: Megaphone, disabled: true },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { href: '/admin/ai-usage', label: 'AI Usage', icon: Sparkles },
    ],
  },
]

const VAPID_PUBLIC_KEY = clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

function ZimplixioMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" overflow="visible" aria-hidden="true">
      <circle cx="200" cy="200" r="160" stroke="#B8924A" strokeWidth="16" fill="none" />
      <path d="M 313,220 A 115,115 0 1,1 288,126 L 362,126 L 362,176 L 250,176 A 65,65 0 1,0 264,211 Z" fill="#276229" />
      <polyline points="183,183 168,200 183,217" stroke="#B8924A" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="217,183 232,200 217,217" stroke="#B8924A" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription()
        setPushEnabled(!!sub)
      })
    }
  }, [])

  async function togglePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription()
        await sub?.unsubscribe()
        setPushEnabled(false)
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        })
        setPushEnabled(true)
      }
    } catch (e) {
      console.error('Push toggle failed:', e)
    } finally {
      setPushLoading(false)
    }
  }

  const userName = session?.user?.name ?? session?.user?.email ?? 'User'
  const userRole = session?.user?.role ?? ''
  const visibleGroups = navGroups.filter((g) => !g.adminOnly || userRole === 'ADMIN')

  return (
    <aside className="flex flex-col h-full w-64 shrink-0" style={{ background: 'var(--navy-900)' }}>

      {/* Logo header */}
      <div className="hero-gradient px-5 py-5 relative overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: 'rgba(99,102,241,0.18)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div className="relative flex items-center gap-3">
          <ZimplixioMark size={30} />
          <div>
            <p className="font-bold text-white text-base leading-none tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              Zimplixio
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(165,180,252,0.7)', letterSpacing: '0.1em' }}>OFFICE</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.22)' }}>
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, disabled }) => {
                const active = pathname === href && !disabled
                return (
                  <Link
                    key={href}
                    href={disabled ? '#' : href}
                    aria-disabled={disabled}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative"
                    style={{
                      background: active ? 'rgba(99,102,241,0.2)' : undefined,
                      color: active ? '#fff' : disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.52)',
                      cursor: disabled ? 'default' : undefined,
                    }}
                    onMouseEnter={e => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)' }}
                    onMouseLeave={e => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.52)' }}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: 'var(--indigo-400)' }} />
                    )}
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                    {disabled && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)', fontSize: '10px' }}>soon</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — user + actions */}
      <div className="px-3 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* User avatar */}
        <div className="flex items-center gap-3 px-3 py-3 mt-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--indigo-600), var(--indigo-400))' }}>
            {initials(userName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">{userName}</p>
            <p className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.35)' }}>{userRole.toLowerCase()}</p>
          </div>
        </div>

        <div className="space-y-0.5 mt-1">
          <SidebarBtn onClick={togglePush} disabled={pushLoading}>
            {pushEnabled ? <BellOff className="w-4 h-4 shrink-0" /> : <Bell className="w-4 h-4 shrink-0" />}
            {pushEnabled ? 'Notifications on' : 'Enable notifications'}
          </SidebarBtn>
          <SidebarBtn onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </SidebarBtn>
        </div>
      </div>
    </aside>
  )
}

function SidebarBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
      style={{ color: 'rgba(255,255,255,0.4)' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
    >
      {children}
    </button>
  )
}
