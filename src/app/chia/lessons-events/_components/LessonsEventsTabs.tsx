'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Domain-first tabs: scheduling and billing for Lessons & Events live together
// because admins think of them as one flow (sell → schedule → bill).
//
// Calendar is the default (week grid). Renewal owns the quarterly renewal
// lifecycle end-to-end (renewing list + batch invoice generation + sent list).
// Invoices is the current-quarter ad-hoc lane: one-off extra lessons, events,
// and mid-quarter new-rider signups that need individual billing.
//
// Subscriptions and Tokens are both management views, not daily flows, so
// they live as lightweight links on the Calendar page header rather than as
// top-level tabs — keeps the tab row focused on what admin touches daily.
//
// (The URL for the ad-hoc lane is still /unbilled for now — content moved
// there is a superset of what the old Unbilled tab showed.)
const tabs = [
  { label: 'Calendar',      href: '/chia/lessons-events',               exact: true  },
  { label: 'Renewal',       href: '/chia/lessons-events/renewal',       exact: false },
  { label: 'Invoices',      href: '/chia/lessons-events/unbilled',      exact: false },
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
