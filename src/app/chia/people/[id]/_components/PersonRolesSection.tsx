'use client'

import { useState, useTransition } from 'react'
import { toggleRole } from '../actions'

const ALL_ROLES = [
  { value: 'rider',            label: 'Rider' },
  { value: 'boarder',          label: 'Boarder' },
  { value: 'instructor',       label: 'Instructor' },
  { value: 'barn_worker',      label: 'Barn Worker' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'admin',            label: 'Admin' },
  { value: 'barn_owner',       label: 'Barn Owner' },
]

export default function PersonRolesSection({
  personId,
  roles: initialRoles,
}: {
  personId: string
  roles:    string[]
}) {
  const [roles, setRoles] = useState(initialRoles)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle(role: string) {
    const hasRole = roles.includes(role)
    setError(null)
    startTransition(async () => {
      const r = await toggleRole(personId, role, !hasRole)
      if (r?.error) {
        setError(r.error)
        return   // don't update local state on failure
      }
      setRoles(prev =>
        hasRole ? prev.filter(r => r !== role) : [...prev, role]
      )
    })
  }

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7]">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Roles</h2>
      </div>
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
        {ALL_ROLES.map(({ value, label }) => {
          const active = roles.includes(value)
          return (
            <button
              key={value}
              onClick={() => handleToggle(value)}
              disabled={isPending}
              className={`
                text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60
                ${active
                  ? 'bg-[#002058] text-white border-[#002058]'
                  : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#002058] hover:text-[#002058]'
                }
              `}
            >
              {label}
            </button>
          )
        })}
      </div>
      {error && (
        <div className="mx-4 mb-3 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}
    </section>
  )
}
