'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Monthly-cycle board services flows. Separate nav track from Lessons & Events
// (which is sold-and-paid-ahead).
// Workflow: barn workers log services (QR / Add Service); logs surface
// directly on Invoices as Draft line items for the admin to review, edit,
// allocate, and batch-generate at month end. No separate review queue —
// Invoices is the single triage surface. Service Catalog and QR Codes are
// configuration-ish — they sit after the operational tab.
// Tabs are named for the admin's mental model, not the DB tables. The
// "Review & Allocate" surface is where Monthly Board + service logs
// accumulate as billing_line_items; "Invoices" is the per-person Stripe
// drafts ready to send. Routes kept stable (/invoices + /drafts) so
// bookmarks + links don't break.
const tabs = [
  { label: 'Review & Allocate', href: '/chia/boarding/invoices' },
  { label: 'Invoices',          href: '/chia/boarding/drafts'   },
  { label: 'Service Catalog',   href: '/chia/boarding/services' },
  { label: 'QR Codes',          href: '/chia/boarding/qr-codes' },
  { label: 'Sign-Up Sheets',    href: '/chia/boarding/sheets'   },
]

export default function BoardingTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-0">
      {tabs.map(({ label, href }) => {
        const active = pathname.startsWith(href)
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
