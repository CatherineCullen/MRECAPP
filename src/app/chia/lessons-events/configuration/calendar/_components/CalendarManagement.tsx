'use client'

import { useState, useTransition, useMemo } from 'react'
import { toggleDayClosed, toggleDayMakeup, updateDayNote, seedMonth } from '../actions'

type CalendarDay = {
  id: string
  date: string
  barn_closed: boolean
  is_makeup_day: boolean
  notes: string | null
}

type Props = {
  days: CalendarDay[]
}

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL  = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December']

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[month - 1]} ${day}`
}

function DayRow({ day }: { day: CalendarDay }) {
  const [pending, startTransition] = useTransition()
  const [editingNote, setEditingNote] = useState(false)
  const [noteValue, setNoteValue] = useState(day.notes ?? '')

  function handleToggleClosed() {
    startTransition(() => toggleDayClosed(day.id, !day.barn_closed))
  }

  function handleToggleMakeup() {
    startTransition(() => toggleDayMakeup(day.id, !day.is_makeup_day))
  }

  function handleSaveNote() {
    startTransition(() => updateDayNote(day.id, noteValue || null))
    setEditingNote(false)
  }

  const rowClass = day.barn_closed
    ? 'bg-red-50 opacity-60'
    : day.is_makeup_day
    ? 'bg-sky-50'
    : ''

  return (
    <tr className={`border-b border-[#c4c6d1]/20 text-xs ${rowClass} ${pending ? 'opacity-50' : ''}`}>
      <td className="py-1.5 pl-3 pr-2 text-[#191c1e] font-medium w-36">
        {formatDate(day.date)}
      </td>
      <td className="py-1.5 px-2 w-20 text-center">
        <button
          onClick={handleToggleClosed}
          disabled={pending}
          className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
            day.barn_closed
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'text-[#444650] hover:bg-[#e8eaf0]'
          }`}
        >
          {day.barn_closed ? 'Closed' : 'Open'}
        </button>
      </td>
      <td className="py-1.5 px-2 w-20 text-center">
        <button
          onClick={handleToggleMakeup}
          disabled={pending}
          className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
            day.is_makeup_day
              ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
              : 'text-[#444650] hover:bg-[#e8eaf0]'
          }`}
        >
          {day.is_makeup_day ? 'Makeup' : '—'}
        </button>
      </td>
      <td className="py-1.5 pl-2 pr-3">
        {editingNote ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={noteValue}
              onChange={e => setNoteValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(); if (e.key === 'Escape') setEditingNote(false) }}
              className="flex-1 text-xs border border-[#c4c6d1] rounded px-2 py-0.5 focus:outline-none focus:border-[#002058]"
              placeholder="Add note…"
            />
            <button onClick={handleSaveNote} className="text-xs text-[#002058] font-semibold hover:underline">Save</button>
            <button onClick={() => setEditingNote(false)} className="text-xs text-[#444650] hover:underline">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setNoteValue(day.notes ?? ''); setEditingNote(true) }}
            className="text-xs text-left text-[#444650] hover:text-[#191c1e] hover:underline w-full truncate"
          >
            {day.notes || <span className="text-[#c4c6d1]">Add note…</span>}
          </button>
        )}
      </td>
    </tr>
  )
}

function MonthPanel({
  year, month, days, defaultOpen,
}: {
  year: number; month: number; days: CalendarDay[]; defaultOpen: boolean
}) {
  const [open, setOpen]     = useState(defaultOpen)
  const [pending, startTransition] = useTransition()

  const closed = days.filter(d => d.barn_closed).length
  const makeup = days.filter(d => d.is_makeup_day).length
  const open_  = days.length - closed

  // Open occurrences per day-of-week (closed days excluded; makeup days
  // count — they're an open lesson day). Useful at-a-glance signal.
  const openByDow = [0, 0, 0, 0, 0, 0, 0]
  for (const d of days) {
    if (d.barn_closed) continue
    const [y, m, day] = d.date.split('-').map(Number)
    const dow = new Date(y, m - 1, day).getDay()
    openByDow[dow]++
  }
  const dowDisplay: Array<{ label: string; count: number }> = [
    { label: 'Mon', count: openByDow[1] },
    { label: 'Tue', count: openByDow[2] },
    { label: 'Wed', count: openByDow[3] },
    { label: 'Thu', count: openByDow[4] },
    { label: 'Fri', count: openByDow[5] },
    { label: 'Sat', count: openByDow[6] },
    { label: 'Sun', count: openByDow[0] },
  ]

  function handleSeed() {
    if (!confirm(`Seed any missing days in ${MONTH_FULL[month - 1]} ${year}?`)) return
    startTransition(async () => {
      await seedMonth(year, month)
    })
  }

  const monthHasGaps = days.length > 0 && days.length < new Date(year, month, 0).getDate()

  return (
    <div className="border border-[#c4c6d1]/40 rounded-lg overflow-hidden mb-3">
      <div
        className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-[#f7f9fc] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#191c1e]">{MONTH_FULL[month - 1]} {year}</span>
          <span className="text-xs text-[#444650]">
            {days.length} day{days.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-xs text-[#444650]">
            <span>{open_} open</span>
            {closed > 0 && <span className="text-red-600">{closed} closed</span>}
            {makeup > 0 && <span className="text-sky-600">{makeup} makeup</span>}
          </div>
          {monthHasGaps && (
            <button
              onClick={e => { e.stopPropagation(); handleSeed() }}
              disabled={pending}
              className="text-xs text-[#002058] font-semibold hover:underline disabled:opacity-50"
              title="Insert any missing days for this month"
            >
              Fill gaps
            </button>
          )}
          <span className="text-[#c4c6d1] text-sm">{open ? '▴' : '▾'}</span>
        </div>
      </div>

      {open && (
        <div className="border-t border-[#c4c6d1]/30">
          <div className="flex items-center gap-4 px-3 py-2 bg-white border-b border-[#c4c6d1]/30">
            <span className="text-[10px] font-semibold text-[#444650] uppercase tracking-wide">
              Open per weekday
            </span>
            <div className="flex gap-3">
              {dowDisplay.map(d => (
                <div key={d.label} className="flex items-baseline gap-1">
                  <span className="text-[10px] font-semibold text-[#444650] uppercase tracking-wide">
                    {d.label}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-[#191c1e]">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex text-[10px] font-semibold text-[#444650] uppercase tracking-wide px-3 py-1.5 bg-[#f7f9fc] border-b border-[#c4c6d1]/30">
            <span className="w-36">Date</span>
            <span className="w-20 text-center">Status</span>
            <span className="w-20 text-center">Makeup</span>
            <span className="flex-1">Note</span>
          </div>
          <table className="w-full">
            <tbody>
              {days.map(day => <DayRow key={day.id} day={day} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CalendarManagement({ days }: Props) {
  const [pending, startTransition] = useTransition()

  // Group days by Y-M
  const grouped = useMemo(() => {
    const map = new Map<string, { year: number; month: number; days: CalendarDay[] }>()
    for (const d of days) {
      const [y, m] = d.date.split('-').map(Number)
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, { year: y, month: m, days: [] })
      map.get(key)!.days.push(d)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.year === b.year ? a.month - b.month : a.year - b.year
    )
  }, [days])

  const today = new Date()
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // Default-open the current and next two months so the most relevant
  // editing surface is visible without clicks.
  const defaultOpenSet = new Set<string>()
  {
    let y = today.getFullYear(), m = today.getMonth() + 1
    for (let i = 0; i < 3; i++) {
      defaultOpenSet.add(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) { m = 1; y++ }
    }
  }

  function handleSeedNext() {
    // Seed the month after the latest one we already show
    const last = grouped[grouped.length - 1]
    let y = last ? last.year : today.getFullYear()
    let m = last ? last.month + 1 : today.getMonth() + 1
    if (m > 12) { m = 1; y++ }
    if (!confirm(`Seed ${MONTH_FULL[m - 1]} ${y}?`)) return
    startTransition(async () => {
      await seedMonth(y, m)
    })
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs text-[#444650]">
          Mark days closed (no lessons) or as makeup days. Defaults to today ± a window;
          extend forward by seeding new months below.
        </p>
        <button
          onClick={handleSeedNext}
          disabled={pending}
          className="text-xs font-semibold text-[#002058] border border-[#002058]/40 px-2.5 py-1 rounded hover:bg-[#dae2ff]/40 disabled:opacity-50 transition-colors"
        >
          + Seed next month
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="text-sm text-[#444650] py-8 text-center">
          No barn-calendar days in the current window.
          <div className="mt-2">
            <button
              onClick={handleSeedNext}
              disabled={pending}
              className="text-xs font-semibold text-[#002058] hover:underline disabled:opacity-50"
            >
              Seed this month to get started
            </button>
          </div>
        </div>
      ) : (
        grouped.map(g => {
          const key = `${g.year}-${String(g.month).padStart(2, '0')}`
          return (
            <MonthPanel
              key={key}
              year={g.year}
              month={g.month}
              days={g.days}
              defaultOpen={defaultOpenSet.has(key) || key === currentYM}
            />
          )
        })
      )}
    </div>
  )
}
