'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export default function MyNav({
  firstName,
  hasHorses,
  hasInvoices,
  showSignUps,
  isAdmin,
  isInstructor,
  canLogServices,
  canLogTrainingRides,
}: {
  firstName: string
  hasHorses: boolean
  hasInvoices: boolean
  showSignUps: boolean
  isAdmin: boolean
  isInstructor: boolean
  canLogServices: boolean
  canLogTrainingRides: boolean
}) {
  const pathname = usePathname()
  const tabsRef  = useRef<HTMLDivElement | null>(null)

  // Translate vertical mouse-wheel into horizontal tab scroll on desktop.
  // Touch swipes on mobile fire scroll events, not wheel events, so this
  // listener never runs on a phone — mobile UX is unchanged.
  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!el) return
      if (el.scrollWidth <= el.clientWidth) return
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const tabs = [
    ...(isInstructor ? [{ label: 'Teaching', href: '/my/teaching' }] : []),
    { label: 'Schedule',  href: '/my/schedule'  },
    ...(hasHorses   ? [{ label: 'Horses',   href: '/my/horses'   }] : []),
    ...(showSignUps ? [{ label: 'Sign-Ups', href: '/my/sign-ups' }] : []),
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
        <div ref={tabsRef} className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
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
