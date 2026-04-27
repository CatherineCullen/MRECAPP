'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSort, SortableHeader, type Sortable } from '@/lib/sortableTable'

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-[#b7f0d0] text-[#1a6b3c]',
  pending:  'bg-[#ffddb3] text-[#7c4b00]',
  away:     'bg-[#e0e3e6] text-[#444650]',
  archived: 'bg-[#e0e3e6] text-[#444650]',
}
const STATUS_ORDER: Record<string, number> = {
  active: 0, pending: 1, away: 2, archived: 3,
}

export type HorseContact = {
  person_id: string
  person: {
    id:              string
    first_name:      string | null
    last_name:       string | null
    organization_name: string | null
    is_organization: boolean | null
  } | null
}

export type HorseRow = {
  id:              string
  barn_name:       string
  registered_name: string | null
  breed:           string | null
  gender:          string | null
  status:          string
  lesson_horse:    boolean
  horse_contact:   HorseContact[]
}

function contactDisplay(hc: HorseContact): string {
  const p = hc.person
  if (!p) return ''
  if (p.is_organization) return p.organization_name ?? ''
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

type Props = { horses: HorseRow[] }

export default function HorsesTable({ horses }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return horses
    return horses.filter(h => {
      const haystack = [
        h.barn_name,
        h.registered_name ?? '',
        h.breed ?? '',
        h.gender ?? '',
        ...h.horse_contact.map(hc => contactDisplay(hc)),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [horses, query])

  const rows = useMemo(() => filtered.map(h => {
    const firstContact = h.horse_contact?.[0]
    const firstContactName = firstContact ? contactDisplay(firstContact) : ''
    return {
      ...h,
      _sort: {
        name:    h.barn_name,
        breed:   h.breed,
        gender:  h.gender,
        people:  firstContactName.toLowerCase() || null,
        status:  STATUS_ORDER[h.status] ?? 99,
      } satisfies Record<string, string | number | null>,
    }
  }) satisfies (HorseRow & Sortable)[], [filtered])

  const { sorted, sort, onSort } = useSort(rows, { key: 'name', dir: 'asc' })

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-[#e8edf4] flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by name, breed, gender, or person…"
          className="flex-1 bg-white border border-[#c4c6d1] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#002058]"
        />
        {query && (
          <span className="text-[11px] text-[#444650] whitespace-nowrap">
            {sorted.length} of {horses.length}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f2f4f7]">
            <SortableHeader sortKey="name"   current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Name</SortableHeader>
            <SortableHeader sortKey="breed"  current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Breed</SortableHeader>
            <SortableHeader sortKey="gender" current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Gender</SortableHeader>
            <SortableHeader sortKey="people" current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">People</SortableHeader>
            <SortableHeader sortKey="status" current={sort} onSort={onSort} className="uppercase tracking-wider text-[11px]">Status</SortableHeader>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((horse, i) => (
            <tr key={horse.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/chia/herd/horses/${horse.id}`}
                    className="font-bold text-[#191c1e] hover:text-[#002058] transition-colors"
                  >
                    {horse.barn_name}
                  </Link>
                  {horse.lesson_horse && (
                    <span className="text-[10px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Lesson
                    </span>
                  )}
                </div>
                {horse.registered_name && horse.registered_name !== horse.barn_name && (
                  <div className="text-xs text-[#444650] mt-0.5">{horse.registered_name}</div>
                )}
              </td>
              <td className="px-4 py-3 text-[#444650]">{horse.breed ?? '—'}</td>
              <td className="px-4 py-3 text-[#444650]">{horse.gender ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-[#444650]">
                {horse.horse_contact?.length
                  ? horse.horse_contact.map((hc, i) => {
                      const p = hc.person
                      if (!p) return null
                      const name = contactDisplay(hc)
                      return (
                        <span key={`${hc.person_id}-${i}`}>
                          {i > 0 && ', '}
                          <Link href={`/chia/people/${p.id}`} className="hover:text-[#002058] hover:underline">
                            {name}
                          </Link>
                        </span>
                      )
                    })
                  : <span className="text-[#c4c6d1]">—</span>}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${STATUS_COLORS[horse.status] ?? ''}`}>
                  {horse.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/chia/herd/horses/${horse.id}`}
                  className="text-xs font-semibold text-[#056380] hover:text-[#002058] transition-colors"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="px-4 py-2.5 bg-[#f2f4f7] border-t border-[#c4c6d1]/20">
        <span className="text-xs text-[#444650]">
          {sorted.length}{query ? ` of ${horses.length}` : ''} horse{horses.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
