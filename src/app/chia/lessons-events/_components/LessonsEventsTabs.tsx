'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Domain-first tabs: scheduling and billing for Lessons & Events live together
// because admins think of them as one flow (sell → schedule → bill).
//
// Order reflects day-to-day frequency:
//   Calendar  — default, the week grid admin looks at constantly.
//   Invoices  — current-quarter ad-hoc lane: one-off extra lessons, events,
//               and mid-quarter new-rider signups that need individual billing.
//   Renewal   — quarterly batch flow (renewing list + batch invoice
//               generation + sent list). Intentionally last because it only
//               fires a few times a year, and sitting between Calendar and
//               Invoices confused the "which invoices live where" split.
//
// Subscriptions and Tokens are management views, not daily flows, so they
// live as lightweight links on the Calendar page header rather than as
// top-level tabs — keeps the tab row focused on what admin touches daily.
//
// (The URL for the ad-hoc lane is still /unbilled for now — content moved
// there is a superset of what the old Unbilled tab showed.)
const tabs = [
  { label: 'Calendar',          href: '/chia/lessons-events',               exact: true,  distinct: false },
  { label: 'Invoices',          href: '/chia/lessons-events/unbilled',      exact: false, distinct: false },
  // Quarterly Renewal sits apart visually — it's a periodic batch flow, not
  // part of the daily Calendar/Invoices rhythm. A left gap + divider signals
  // "different mode" without pushing it off into a second nav row.
  { label: 'Quarterly Renewal', href: '/chia/lessons-events/renewal',       exact: false, distinct: true  },
  // Configuration groups Catalog and Quarters — both are rare admin tasks,
  // not part of the daily Calendar/Invoices/Renewal flow.
  { label: 'Configuration',     href: '/chia/lessons-events/configuration', exact: false, distinct: true  },
]

export default function LessonsEventsTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 items-stretch">
      {tabs.map(({ label, href, exact, distinct }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href)
        return (
          <div key={href} className={`flex items-stretch ${distinct ? 'ml-4 pl-4 border-l border-[#d7d9de]' : ''}`}>
            <Link
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
          </div>
        )
      })}
    </div>
  )
}
