'use client'

import { useRouter, usePathname } from 'next/navigation'

const OPTIONS = [
  { value: 'active',   label: 'Active'   },
  { value: 'pending',  label: 'Pending'  },
  { value: 'away',     label: 'Away'     },
  { value: 'archived', label: 'Archived' },
  { value: 'all',      label: 'All'      },
]

export default function HorseStatusFilter({ current }: { current: string }) {
  const router = useRouter()
  const pathname = usePathname()

  function handleChange(value: string) {
    const params = new URLSearchParams()
    if (value !== 'active') params.set('status', value)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex items-center gap-1 bg-[#f2f4f7] rounded p-0.5">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          className={`
            px-3 py-1.5 text-xs font-semibold rounded transition-colors
            ${current === value
              ? 'bg-white text-[#002058] shadow-sm'
              : 'text-[#444650] hover:text-[#191c1e]'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
