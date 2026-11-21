'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type SectionTab = { href: string; label: string }

// Generic tab bar; a tab is active when the path equals or sits under its href.
// Deliberately NOT prefetch={true}: a fully prefetched admin route renders from
// the client cache on click, so a revoked session would keep seeing those pages
// instead of being signed out (breaks the "signed out on next click" rule).
// Each route's loading.tsx gives instant feedback instead.
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname()
  return (
    <nav className="admin-tabs" aria-label="Sections">
      {tabs.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={active ? 'admin-tab admin-tab-active' : 'admin-tab'}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
