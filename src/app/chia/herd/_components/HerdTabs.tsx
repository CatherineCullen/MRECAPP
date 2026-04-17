'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Horses',      href: '/chia/herd/horses'     },
  { label: 'Health',      href: '/chia/herd/health'      },
  { label: 'Temporary Care Plans', href: '/chia/herd/care-plans' },
  { label: 'Diets',       href: '/chia/herd/diets'       },
  { label: 'Import',      href: '/chia/herd/import'      },
]

export default function HerdTabs() {
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
