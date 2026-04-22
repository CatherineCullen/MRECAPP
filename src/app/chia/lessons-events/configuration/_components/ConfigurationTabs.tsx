'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Catalog',                  href: '/chia/lessons-events/configuration/catalog'      },
  { label: 'Quarters',                 href: '/chia/lessons-events/configuration/quarters'     },
  { label: 'Instructor availability',  href: '/chia/lessons-events/configuration/availability' },
]

export default function ConfigurationTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 items-stretch">
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
