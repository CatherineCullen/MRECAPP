'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function MyNav({
  firstName,
  hasHorses,
  hasInvoices,
  isAdmin,
  isInstructor,
  canLogServices,
  canLogTrainingRides,
}: {
  firstName: string
  hasHorses: boolean
  hasInvoices: boolean
  isAdmin: boolean
  isInstructor: boolean
  canLogServices: boolean
  canLogTrainingRides: boolean
}) {
  const pathname = usePathname()

  const tabs = [
    ...(isInstructor ? [{ label: 'Teaching', href: '/my/teaching' }] : []),
    { label: 'Schedule',  href: '/my/schedule'  },
    ...(hasHorses   ? [{ label: 'Horses',   href: '/my/horses'   }] : []),
    ...(canLogTrainingRides ? [{ label: 'Training', href: '/my/training-rides' }] : []),
    ...(canLogServices ? [{ label: 'Services', href: '/my/services' }] : []),
    ...(hasInvoices ? [{ label: 'Invoices', href: '/my/invoices' }] : []),
    { label: 'Profile',   href: '/my/profile'   },
  ]

  return (
    <div className="sticky top-0 z-20 bg-primary" style={{ background: 'rgba(0,32,88,0.97)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-md mx-auto">
        {/* Wordmark + user */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-white font-bold text-sm tracking-tight">Marlboro Ridge Equestrian Center</span>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link href="/chia" className="text-secondary/80 hover:text-white text-[11px] font-semibold uppercase tracking-wider">
                CHIA →
              </Link>
            )}
            <span className="text-secondary/60 text-xs">{firstName}</span>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {tabs.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  active
                    ? 'border-secondary text-white'
                    : 'border-transparent text-secondary/50 hover:text-white'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
