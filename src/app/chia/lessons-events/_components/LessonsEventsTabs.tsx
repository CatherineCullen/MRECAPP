'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Domain-first tabs: scheduling and billing for Lessons & Events live together
// because admins think of them as one flow (sell → schedule → bill).
// Calendar is the default (week grid). Subscriptions lists the quarterly
// recurring slots. Unbilled shows one-off products + events awaiting invoice.
const tabs = [
  { label: 'Calendar',      href: '/chia/lessons-events',               exact: true  },
  { label: 'Subscriptions', href: '/chia/lessons-events/subscriptions', exact: false },
  { label: 'Unbilled',      href: '/chia/lessons-events/unbilled',      exact: false },
]

export default function LessonsEventsTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-0">
      {tabs.map(({ label, href, exact }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`
              px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors
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
