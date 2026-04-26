'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// Domain-first nav: each top-level section owns both its scheduling and its
// billing. Lessons & Events bundles calendar + subscriptions + unbilled
// products. Boarding bundles invoices + service catalog + QR codes — the
// section is named for the activity/product, not the people (who are
// "boarders" — see the People filter). Training Rides is its own thing
// (no billing surface).
const sections = [
  { label: 'Herd',             href: '/chia/herd',             icon: '⬡' },
  { label: 'Lessons & Events', href: '/chia/lessons-events',   icon: '◷' },
  { label: 'Training Rides',   href: '/chia/training-rides',   icon: '◉' },
  { label: 'People',           href: '/chia/people',           icon: '◯' },
  { label: 'Boarding',         href: '/chia/boarding',         icon: '▣' },
  { label: 'Documents',        href: '/chia/documents',        icon: '▤' },
  { label: 'Data',             href: '/chia/data',             icon: '◈' },
  { label: 'Notifications',     href: '/chia/settings',         icon: '◎' },
]

// On desktop the sidebar is always in the layout flow. On mobile it slides
// in over the content with a backdrop, so an admin doing emergency lookups
// from a phone isn't stuck on a screen of just nav. Auto-closes on route
// change so a tap doesn't leave the overlay open over the new page.
export default function ChiaSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Mobile hamburger — only visible when closed, floats over content */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={false}
          className="lg:hidden fixed top-2 left-2 z-50 w-9 h-9 rounded bg-[#002058] text-white flex items-center justify-center shadow-md"
        >
          <span className="sr-only">Open menu</span>
          <span aria-hidden className="text-lg leading-none">☰</span>
        </button>
      )}

      {/* Backdrop — mobile only, click to dismiss */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
          aria-hidden
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-48 bg-[#002058] flex flex-col
          transform transition-transform duration-200
          lg:static lg:translate-x-0 lg:flex-shrink-0
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Wordmark */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <span className="text-[#dae2ff] font-bold text-xl tracking-tight">CHIA</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden text-[#dae2ff] text-lg leading-none px-1"
          >
            ☰
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {sections.map(({ label, href, icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors
                  ${active
                    ? 'bg-white/15 text-white'
                    : 'text-[#89CFF0]/80 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <span className="text-xs opacity-70">{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Version tag */}
        <div className="px-5 py-3 border-t border-white/10">
          <span className="text-[#89CFF0]/40 text-xs">Phase 1</span>
        </div>
      </aside>
    </>
  )
}
