'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/departments/product-research', label: 'Overview' },
  { href: '/departments/product-research/company-profile', label: 'Company Profile' },
  { href: '/departments/product-research/findings', label: 'Findings' },
]

export default function ProductResearchTabs() {
  const pathname = usePathname()

  return (
    <div className="border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-4xl mx-auto px-8 flex gap-6">
        {TABS.map(({ href, label }) => {
          const active =
            href === '/departments/product-research'
              ? pathname === href
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="py-4 text-sm font-medium border-b-2 -mb-px transition-colors"
              style={{
                borderColor: active ? 'var(--green-600)' : 'transparent',
                color: active ? 'var(--green-600)' : 'var(--gray-600)',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
