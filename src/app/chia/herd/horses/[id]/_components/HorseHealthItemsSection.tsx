'use client'

import { useState } from 'react'

export type HorseHealthItem = {
  id:                   string
  last_done:            string | null
  next_due:             string | null
  type: {
    id:                      string
    name:                    string
    is_essential:            boolean
    show_in_herd_dashboard:  boolean
  }
}

const DUE_SOON_DAYS = 30

type Bucket = 'overdue' | 'due_soon' | 'ok' | 'no_due_date'

function bucketFor(nextDue: string | null): Bucket {
  if (!nextDue) return 'no_due_date'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(nextDue + 'T00:00:00')
  const daysOut = Math.floor((due.getTime() - today.getTime()) / 86400000)
  if (daysOut < 0)             return 'overdue'
  if (daysOut <= DUE_SOON_DAYS) return 'due_soon'
  return 'ok'
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

export default function HorseHealthItemsSection({ items }: { items: HorseHealthItem[] }) {
  const [expanded, setExpanded] = useState(false)

  // Sort by next_due ascending (soonest first), nulls last
  const sorted = [...items].sort((a, b) => {
    if (!a.next_due && !b.next_due) return a.type.name.localeCompare(b.type.name)
    if (!a.next_due) return 1
    if (!b.next_due) return -1
    return a.next_due.localeCompare(b.next_due)
  })

  const attention = sorted.filter(i => {
    const b = bucketFor(i.next_due)
    return b === 'overdue' || b === 'due_soon'
  })
  const rest = sorted.filter(i => !attention.includes(i))

  if (sorted.length === 0) {
    return (
      <section className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7]">
          <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Health Items</h2>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-[#444650]">No health items recorded.</p>
        </div>
      </section>
    )
  }

  function Row({ item }: { item: HorseHealthItem }) {
    const b = bucketFor(item.next_due)
    const pillClass =
      b === 'overdue'  ? 'bg-[#ffdad6] text-[#b00020] font-semibold' :
      b === 'due_soon' ? 'bg-[#ffddb3] text-[#7c4b00] font-medium'   :
                         'text-[#444650]'
    const pillLabel =
      b === 'overdue'     ? `Overdue — due ${formatDate(item.next_due)}` :
      b === 'due_soon'    ? `Due ${formatDate(item.next_due)}`            :
      b === 'ok'          ? `Next due ${formatDate(item.next_due)}`       :
                            'No upcoming date'

    return (
      <div className="flex items-center justify-between gap-4 py-2 border-b border-[#f2f4f7] last:border-0">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#191c1e]">{item.type.name}</span>
          {item.type.is_essential && (
            <span className="text-[9px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded uppercase tracking-wider">
              Essential
            </span>
          )}
          {!item.type.show_in_herd_dashboard && (
            <span className="text-[9px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider" title="Not shown on the herd dashboard grid.">
              Not on grid
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {item.last_done && (
            <span className="text-[10px] text-[#444650]">
              Last: {formatDate(item.last_done)}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded ${pillClass}`}>
            {pillLabel}
          </span>
        </div>
      </div>
    )
  }

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Health Items
          <span className="ml-1.5 text-[10px] font-normal text-[#444650] normal-case tracking-normal">
            ({attention.length} need attention / {sorted.length} total)
          </span>
        </h2>
      </div>
      <div className="px-4 pt-1 pb-2">
        {attention.length === 0 && (
          <p className="py-2 text-xs text-[#444650]">Nothing overdue or due within 30 days.</p>
        )}
        {attention.map(i => <Row key={i.id} item={i} />)}

        {expanded && rest.map(i => <Row key={i.id} item={i} />)}

        {rest.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            {expanded ? 'Show less' : `Show ${rest.length} more`}
          </button>
        )}
      </div>
    </section>
  )
}
