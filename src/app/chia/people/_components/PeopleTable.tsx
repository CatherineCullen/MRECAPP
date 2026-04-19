'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSort, SortableHeader, type Sortable } from '@/lib/sortableTable'

const ROLE_LABELS: Record<string, string> = {
  rider:            'Rider',
  owner:            'Owner',
  instructor:       'Instructor',
  admin:            'Admin',
  barn_owner:       'Barn Owner',
  barn_worker:      'Barn Worker',
  service_provider: 'Service Provider',
}

const ROLE_COLORS: Record<string, string> = {
  rider:            'bg-[#dae2ff] text-[#002058]',
  owner:            'bg-[#b7f0d0] text-[#1a6b3c]',
  instructor:       'bg-[#e8d5ff] text-[#4a1a8c]',
  admin:            'bg-[#002058] text-white',
  barn_owner:       'bg-[#002058] text-white',
  barn_worker:      'bg-[#e8edf4] text-[#444650]',
  service_provider: 'bg-[#ffddb3] text-[#7c4b00]',
}

// Cheap role-rank so sort-by-roles groups similar staff together. Lower = earlier.
const ROLE_RANK: Record<string, number> = {
  barn_owner: 0, admin: 1, instructor: 2, barn_worker: 3,
  service_provider: 4, owner: 5, rider: 6,
}

export type PersonHorseContact = {
  id: string
  horse_id: string
  horse: { barn_name: string } | null
}

export type PersonRow = {
  id:                        string
  display_name:              string
  preferred_note:            string | null
  is_minor:                  boolean
  is_training_ride_provider: boolean
  email:                     string | null
  phone:                     string | null
  roles:                     string[]
  horse_contact:             PersonHorseContact[]
}

type Props = { people: PersonRow[] }

export default function PeopleTable({ people }: Props) {
  const [query, setQuery] = useState('')

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(p => {
      const haystack = [
        p.display_name,
        p.preferred_note ?? '',
        p.email ?? '',
        p.phone ?? '',
        ...p.roles.map(r => ROLE_LABELS[r] ?? r),
        ...p.horse_contact.map(hc => hc.horse?.barn_name ?? ''),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [people, query])

  const rows = useMemo(() => filteredPeople.map(p => {
    const firstRoleRank = p.roles.length
      ? Math.min(...p.roles.map(r => ROLE_RANK[r] ?? 99))
      : 99
    const firstHorse = p.horse_contact?.[0]?.horse?.barn_name ?? null
    return {
      ...p,
      _sort: {
        name:   p.display_name.toLowerCase(),
        roles:  p.roles.length ? firstRoleRank : null,
        horses: firstHorse ? firstHorse.toLowerCase() : null,
        email:  p.email ? p.email.toLowerCase() : null,
        phone:  p.phone ?? null,
      } satisfies Record<string, string | number | null>,
    }
  }) satisfies (PersonRow & Sortable)[], [filteredPeople])

  const { sorted, sort, onSort } = useSort(rows, { key: 'name', dir: 'asc' })

  return (
    <div>
      <div className="px-4 py-2 border-b border-[#e8edf4] flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by name, email, phone, role, or horse…"
          className="flex-1 bg-white border border-[#c4c6d1] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#002058]"
        />
        {query && (
          <span className="text-[11px] text-[#444650] whitespace-nowrap">
            {rows.length} of {people.length}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[#444650]">No matches.</div>
      ) : (
      <table className="w-full text-sm">
      <thead>
        <tr className="bg-[#f2f4f7]">
          <SortableHeader sortKey="name"   current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Name</SortableHeader>
          <SortableHeader sortKey="roles"  current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Roles</SortableHeader>
          <SortableHeader sortKey="horses" current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Horses</SortableHeader>
          <SortableHeader sortKey="email"  current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Email</SortableHeader>
          <SortableHeader sortKey="phone"  current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Phone</SortableHeader>
        </tr>
      </thead>
      <tbody>
        {sorted.map((person, i) => (
          <tr key={person.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}>
            <td className="px-4 py-2.5">
              <Link
                href={`/chia/people/${person.id}`}
                className="font-semibold text-[#191c1e] hover:text-[#002058]"
              >
                {person.display_name}
              </Link>
              {person.preferred_note && (
                <span className="ml-1.5 text-xs text-[#444650]">{person.preferred_note}</span>
              )}
              {person.is_minor && (
                <span className="ml-1.5 text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider">Minor</span>
              )}
            </td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-1 flex-wrap">
                {person.roles.map(r => (
                  <span key={r} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${ROLE_COLORS[r] ?? 'bg-[#e8edf4] text-[#444650]'}`}>
                    {ROLE_LABELS[r] ?? r}
                  </span>
                ))}
                {person.is_training_ride_provider && (
                  <span className="text-[10px] font-semibold bg-[#ffddb3] text-[#7c4b00] px-1.5 py-0.5 rounded uppercase tracking-wider">TR Provider</span>
                )}
              </div>
            </td>
            <td className="px-4 py-2.5 text-[#444650] text-xs">
              {person.horse_contact.length > 0
                ? person.horse_contact.map((hc, i) => hc.horse ? (
                    <span key={hc.horse_id}>
                      {i > 0 && ', '}
                      <Link href={`/chia/herd/horses/${hc.horse_id}`} className="hover:text-[#002058] hover:underline">
                        {hc.horse.barn_name}
                      </Link>
                    </span>
                  ) : null)
                : <span className="text-[#c4c6d1]">—</span>}
            </td>
            <td className="px-4 py-2.5 text-[#444650]">
              {person.email
                ? <a href={`mailto:${person.email}`} className="hover:text-[#002058]">{person.email}</a>
                : <span className="text-[#c4c6d1]">—</span>}
            </td>
            <td className="px-4 py-2.5 text-[#444650]">{person.phone ?? <span className="text-[#c4c6d1]">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
      )}
    </div>
  )
}
