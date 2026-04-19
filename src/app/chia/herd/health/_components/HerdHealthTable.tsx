'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSort, SortableHeader, type Sortable } from '@/lib/sortableTable'

type CellStatus = 'overdue' | 'due_soon' | 'ok' | 'essential_missing' | 'blank'

const CELL_STYLES: Record<CellStatus, string> = {
  overdue:           'bg-[#ffdad6] text-[#b00020] font-semibold',
  due_soon:          'bg-[#ffddb3] text-[#7c4b00] font-medium',
  ok:                'text-[#191c1e]',
  essential_missing: 'text-[#c4c6d1] italic',
  blank:             '',
}

// Lower = more urgent = sorts first
const STATUS_RANK: Record<CellStatus, number> = {
  overdue: 0, due_soon: 1, essential_missing: 2, ok: 3, blank: 4,
}

export type HealthCell = {
  status:  CellStatus
  display: string
}

export type HerdHealthRow = {
  id:       string
  barn_name: string
  cells:    Record<string, HealthCell>  // keyed by health_item_type_id
}

export type HealthItemCol = {
  id:          string
  name:        string
  is_essential: boolean
}

type Props = {
  horses:    HerdHealthRow[]
  itemTypes: HealthItemCol[]
}

export default function HerdHealthTable({ horses, itemTypes }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return horses
    return horses.filter(h => h.barn_name.toLowerCase().includes(q))
  }, [horses, query])

  const rows = useMemo(() => filtered.map(h => {
    const sortValues: Record<string, string | number | null> = {
      name: h.barn_name.toLowerCase(),
    }
    for (const t of itemTypes) {
      sortValues[t.id] = STATUS_RANK[h.cells[t.id]?.status ?? 'blank']
    }
    return { ...h, _sort: sortValues } satisfies HerdHealthRow & Sortable
  }), [filtered, itemTypes])

  const { sorted, sort, onSort } = useSort(rows, { key: 'name', dir: 'asc' })

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-[#e8edf4] flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by horse name…"
          className="w-64 bg-white border border-[#c4c6d1] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#002058]"
        />
        {query && (
          <span className="text-[11px] text-[#444650] whitespace-nowrap">
            {sorted.length} of {horses.length}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-[#f2f4f7]">
              <SortableHeader
                sortKey="name"
                current={sort}
                onSort={onSort}
                className="uppercase tracking-wider text-[11px] sticky left-0 bg-[#f2f4f7] z-10 whitespace-nowrap"
              >
                Horse
              </SortableHeader>
              {itemTypes.map(t => (
                <SortableHeader
                  key={t.id}
                  sortKey={t.id}
                  current={sort}
                  onSort={onSort}
                  align="right"
                  className="uppercase tracking-wider text-[11px] whitespace-nowrap min-w-[110px]"
                >
                  {t.name}{t.is_essential && <span className="text-[#b00020] ml-0.5">*</span>}
                </SortableHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((horse, i) => (
              <tr key={horse.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}>
                <td className={`px-4 py-2.5 sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}`}>
                  <Link
                    href={`/chia/herd/horses/${horse.id}`}
                    className="font-semibold text-[#191c1e] hover:text-[#002058] whitespace-nowrap"
                  >
                    {horse.barn_name}
                  </Link>
                </td>
                {itemTypes.map(t => {
                  const cell = horse.cells[t.id] ?? { status: 'blank' as CellStatus, display: '' }
                  return (
                    <td
                      key={t.id}
                      className={`px-3 py-2.5 text-right text-xs whitespace-nowrap ${CELL_STYLES[cell.status]}`}
                    >
                      {cell.display}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 bg-[#f2f4f7] border-t border-[#c4c6d1]/20 flex items-center gap-5 flex-wrap">
        <span className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Legend</span>
        <span className="text-[10px] bg-[#ffdad6] text-[#b00020] font-semibold px-2 py-0.5 rounded">Overdue</span>
        <span className="text-[10px] bg-[#ffddb3] text-[#7c4b00] font-medium px-2 py-0.5 rounded">Due within 30 days</span>
        <span className="text-[10px] text-[#191c1e] px-2 py-0.5">OK</span>
        <span className="text-[10px] text-[#c4c6d1] italic px-2 py-0.5">no record (essential*)</span>
      </div>
    </div>
  )
}
