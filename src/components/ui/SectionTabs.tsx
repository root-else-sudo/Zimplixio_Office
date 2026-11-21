'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type SectionTab = { href: string; label: string }

// Generic tab bar; a tab is active when the path equals or sits under its href.
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
