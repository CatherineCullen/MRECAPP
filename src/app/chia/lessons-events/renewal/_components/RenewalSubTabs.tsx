'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Sub-tabs for the Renewal section. Roster holds the rider list + bulk
// actions; Invoices holds the drafts/sent lane for next-quarter subs.
// They're split because the roster is the long list that would push anything
// below it off the screen once we scale past a handful of riders.
const subTabs = [
  { label: 'Roster',   href: '/chia/lessons-events/renewal',          exact: true  },
  { label: 'Invoices', href: '/chia/lessons-events/renewal/invoices', exact: false },
]

export default function RenewalSubTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 border-b border-[#c4c6d1]/30">
      {subTabs.map(({ label, href, exact }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`
              px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors
              ${active
                ? 'border-[#002058] text-[#002058]'
                : 'border-transparent text-[#444650] hover:text-[#191c1e]'
              }
            `}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
