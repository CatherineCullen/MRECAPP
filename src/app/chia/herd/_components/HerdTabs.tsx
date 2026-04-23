'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Horses',      href: '/chia/herd/horses',     key: 'horses'    },
  { label: 'Health',      href: '/chia/herd/health',     key: 'health'    },
  { label: 'Temporary Care Plans', href: '/chia/herd/care-plans', key: 'care-plans' },
  { label: 'Diets',       href: '/chia/herd/diets',      key: 'diets'     },
  { label: 'Import',      href: '/chia/herd/import',     key: 'import'    },
  { label: 'Uploads',     href: '/chia/herd/uploads',    key: 'uploads'   },
] as const

export default function HerdTabs({ pendingUploads = 0 }: { pendingUploads?: number }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-0">
      {tabs.map(({ label, href, key }) => {
        const active = pathname.startsWith(href)
        const showBadge = key === 'uploads' && pendingUploads > 0
        return (
          <Link
            key={href}
            href={href}
            className={`
              px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors
              inline-flex items-center gap-1.5
              ${active
                ? 'border-[#002058] text-[#002058]'
                : 'border-transparent text-[#444650] hover:text-[#191c1e]'
              }
            `}
          >
            {label}
            {showBadge && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#002058] text-white text-[10px] font-bold tabular-nums">
                {pendingUploads}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
