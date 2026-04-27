'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import InstructorBadge from '../../_components/InstructorBadge'
import { useSort, SortableHeader, type Sortable } from '@/lib/sortableTable'

const DAY_LABEL: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
const DAY_INDEX: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-[#fff4d6] text-[#7a5a00]',
  active:    'bg-[#b7f0d0] text-[#1a6b3c]',
  cancelled: 'bg-[#ffd6d6] text-[#8a1a1a]',
  completed: 'bg-[#e8edf4] text-[#444650]',
}
const STATUS_ORDER: Record<string, number> = {
  pending: 0, active: 1, completed: 2, cancelled: 3,
}

function formatTime(t: string) {
  const [hStr, m] = t.split(':')
  const h = Number(hStr)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${period}`
}

export type SubRow = {
  id:                    string
  rider_id:              string | null
  rider_name:            string
  instructor: {
    id:             string | null
    first_name:     string | null
    last_name:      string | null
    preferred_name: string | null
    calendar_color: string | null
  } | null
  instructor_name:       string
  lesson_day:            string
  lesson_time:           string
  horse_name:            string | null
  subscription_type:     string
  subscription_price:    number
  is_prorated:           boolean
  prorated_price:        number | null
  prorated_lesson_count: number | null
  status:                string
}

type Props = { rows: SubRow[] }

export default function SubscriptionsTable({ rows }: Props) {
  const augmented = useMemo(() => rows.map(s => {
    const effPrice = s.is_prorated && s.prorated_price != null
      ? Number(s.prorated_price)
      : Number(s.subscription_price)
    const slotKey = (DAY_INDEX[s.lesson_day] ?? 99) * 10000
      + Number(s.lesson_time.slice(0, 2)) * 60
      + Number(s.lesson_time.slice(3, 5))
    return {
      ...s,
      _effPrice: effPrice,
      _sort: {
        rider:      s.rider_name,
        instructor: s.instructor_name,
        slot:       slotKey,
        horse:      s.horse_name,
        type:       s.subscription_type,
        price:      effPrice,
        status:     STATUS_ORDER[s.status] ?? 99,
      } satisfies Record<string, string | number | null>,
    }
  }) satisfies (SubRow & Sortable & { _effPrice: number })[], [rows])

  const { sorted, sort, onSort } = useSort(augmented, { key: null, dir: 'asc' })

  return (
    <div className="bg-white rounded border border-[#c4c6d1]/40 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#f7f9fc] border-b border-[#c4c6d1]/30 text-left">
            <SortableHeader sortKey="rider"      current={sort} onSort={onSort}>Rider</SortableHeader>
            <SortableHeader sortKey="instructor" current={sort} onSort={onSort}>Instructor</SortableHeader>
            <SortableHeader sortKey="slot"       current={sort} onSort={onSort}>Slot</SortableHeader>
            <SortableHeader sortKey="horse"      current={sort} onSort={onSort}>Horse</SortableHeader>
            <SortableHeader sortKey="type"       current={sort} onSort={onSort}>Type</SortableHeader>
            <SortableHeader sortKey="price"      current={sort} onSort={onSort}>Price</SortableHeader>
            <SortableHeader sortKey="status"     current={sort} onSort={onSort}>Status</SortableHeader>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const priceShown = s.is_prorated && s.prorated_price != null
              ? `$${Number(s.prorated_price).toFixed(0)}`
              : `$${Number(s.subscription_price).toFixed(0)}`
            return (
              <tr key={s.id} className="border-b border-[#c4c6d1]/20 hover:bg-[#f7f9fc]/60">
                <td className="py-1.5 px-3 font-medium text-[#191c1e]">
                  {s.rider_id ? (
                    <Link
                      href={`/chia/people/${s.rider_id}`}
                      target="_blank"
                      rel="noopener"
                      className="hover:underline hover:text-[#002058]"
                      title="Open profile in new tab"
                    >
                      {s.rider_name || '—'}
                    </Link>
                  ) : (s.rider_name || '—')}
                </td>
                <td className="py-1.5 px-3 text-[#444650]">
                  <span className="inline-flex items-center gap-1.5">
                    <InstructorBadge instructor={s.instructor} size="compact" />
                    {s.instructor?.id ? (
                      <Link
                        href={`/chia/people/${s.instructor.id}`}
                        target="_blank"
                        rel="noopener"
                        className="hover:underline hover:text-[#002058]"
                        title="Open profile in new tab"
                      >
                        {s.instructor_name || '—'}
                      </Link>
                    ) : (s.instructor_name || '—')}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-[#444650]">
                  {DAY_LABEL[s.lesson_day]} {formatTime(s.lesson_time)}
                </td>
                <td className="py-1.5 px-3 text-[#444650]">{s.horse_name ?? '—'}</td>
                <td className="py-1.5 px-3 text-[#444650] capitalize">{s.subscription_type}</td>
                <td className="py-1.5 px-3 text-[#444650]">
                  {priceShown}
                  {s.is_prorated && (
                    <span className="text-[10px] text-[#7a5a00] ml-1">prorated · {s.prorated_lesson_count}</span>
                  )}
                </td>
                <td className="py-1.5 px-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_COLORS[s.status] ?? ''}`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-right">
                  <Link
                    href={`/chia/lessons-events/subscriptions/${s.id}/edit`}
                    className="text-[10px] font-semibold text-[#002058] hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
