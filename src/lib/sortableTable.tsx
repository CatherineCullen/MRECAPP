'use client'

import { useMemo, useState } from 'react'

// Shared sort utility for admin tables. Barn-scale data — rows fit comfortably
// in memory, so sorting is done client-side without URL state. Each row carries
// a `_sort` record of pre-shaped primitives (string | number | null) keyed by
// column; the hook picks the active key and direction, nulls sort last.

export type SortValue = string | number | null
export type Sortable = { _sort: Record<string, SortValue> }

export type SortDir = 'asc' | 'desc'

export type SortState = { key: string | null; dir: SortDir }

/**
 * Click a header → sort ascending. Click again → descending. Click a third
 * time (or a different column) → reset/switch. Default is the initial key
 * the caller specifies (typically whatever order the server returned).
 */
export function useSort<T extends Sortable>(
  rows: T[],
  initial: SortState = { key: null, dir: 'asc' },
) {
  const [sort, setSort] = useState<SortState>(initial)

  const sorted = useMemo(() => {
    if (!sort.key) return rows
    const key = sort.key
    const mult = sort.dir === 'asc' ? 1 : -1
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a._sort[key]
      const bv = b._sort[key]
      // Nulls always sort last, regardless of direction.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * mult
      }
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * mult
    })
    return copy
  }, [rows, sort])

  function onSort(key: string) {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc')  return { key, dir: 'desc' }
      return { key: null, dir: 'asc' } // third click clears
    })
  }

  return { sorted, sort, onSort }
}

type HeaderProps = {
  sortKey:  string
  current:  SortState
  onSort:   (key: string) => void
  children: React.ReactNode
  className?: string
  align?: 'left' | 'right'
}

export function SortableHeader({ sortKey, current, onSort, children, className = '', align = 'left' }: HeaderProps) {
  const active = current.key === sortKey
  const arrow  = !active ? '' : current.dir === 'asc' ? '▲' : '▼'
  return (
    <th className={`py-2 px-3 font-semibold text-[#444650] ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-[#002058] ${active ? 'text-[#002058]' : ''}`}
      >
        <span>{children}</span>
        <span className="text-[9px] w-2 inline-block">{arrow}</span>
      </button>
    </th>
  )
}
