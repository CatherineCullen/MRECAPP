'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const ROLES = [
  { value: 'all',            label: 'All' },
  { value: 'rider',          label: 'Riders' },
  { value: 'boarder',        label: 'Boarders' },
  { value: 'instructor',     label: 'Instructors' },
  { value: 'barn_worker',    label: 'Barn Workers' },
  { value: 'service_provider', label: 'Service Providers' },
  { value: 'admin',          label: 'Admin' },
]

export default function PeopleFilters({
  selectedRole,
  includeInactive,
}: {
  selectedRole:    string
  includeInactive: boolean
}) {
  const router = useSearchParams()
  const nav    = useRouter()

  function update(role: string, inactive: boolean) {
    const params = new URLSearchParams()
    if (role && role !== 'all') params.set('role', role)
    if (inactive) params.set('inactive', '1')
    nav.push(`/chia/people?${params.toString()}`)
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Role pills */}
      <div className="flex items-center gap-1 flex-wrap">
        {ROLES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => update(value, includeInactive)}
            className={`
              text-xs font-semibold px-3 py-1.5 rounded-full transition-colors
              ${selectedRole === value
                ? 'bg-[#002058] text-white'
                : 'bg-[#f2f4f7] text-[#444650] hover:bg-[#e8edf4]'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Inactive toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={e => update(selectedRole, e.target.checked)}
          className="w-4 h-4 accent-[#002058]"
        />
        <span className="text-xs text-[#444650]">Include inactive</span>
      </label>
    </div>
  )
}
