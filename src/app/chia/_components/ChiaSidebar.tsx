'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
  { label: 'Data',             href: '/chia/data',             icon: '◈' },
  { label: 'Configuration',    href: '/chia/configuration',    icon: '◧' },
]

export default function ChiaSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-48 flex-shrink-0 bg-[#002058] flex flex-col">
      {/* Wordmark */}
      <div className="px-5 py-4 border-b border-white/10">
        <span className="text-[#dae2ff] font-bold text-xl tracking-tight">CHIA</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
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
  )
}
