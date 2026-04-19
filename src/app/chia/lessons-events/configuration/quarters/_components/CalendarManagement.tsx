'use client'

import { useState, useTransition } from 'react'
import { toggleDayClosed, toggleDayMakeup, updateDayNote, setQuarterActive } from '../actions'

type CalendarDay = {
  id: string
  date: string
  barn_closed: boolean
  is_makeup_day: boolean
  notes: string | null
}

type Quarter = {
  id: string
  label: string
  start_date: string
  end_date: string
  is_active: boolean
  days: CalendarDay[]
}

type Props = {
  quarters: Quarter[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[month - 1]} ${day}`
}

function DayRow({ day, quarterId }: { day: CalendarDay; quarterId: string }) {
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

function MonthGroup({ label, days, quarterId }: { label: string; days: CalendarDay[]; quarterId: string }) {
  const closedCount = days.filter(d => d.barn_closed).length
  const makeupCount = days.filter(d => d.is_makeup_day).length

  return (
    <div className="mb-2">
      <div className="flex items-baseline gap-3 px-3 py-1.5 bg-[#f7f9fc] border-b border-[#c4c6d1]/40">
        <span className="text-xs font-bold text-[#191c1e]">{label}</span>
        {closedCount > 0 && (
          <span className="text-xs text-red-600">{closedCount} closed</span>
        )}
        {makeupCount > 0 && (
          <span className="text-xs text-sky-600">{makeupCount} makeup</span>
        )}
      </div>
      <table className="w-full">
        <tbody>
          {days.map(day => (
            <DayRow key={day.id} day={day} quarterId={quarterId} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QuarterPanel({ quarter }: { quarter: Quarter }) {
  const [open, setOpen] = useState(quarter.is_active)
  const [pending, startTransition] = useTransition()

  // Group days by month
  const byMonth = new Map<string, CalendarDay[]>()
  for (const day of quarter.days) {
    const [year, month] = day.date.split('-')
    const key = `${MONTH_NAMES[Number(month) - 1]} ${year}`
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(day)
  }

  const closedDays = quarter.days.filter(d => d.barn_closed).length
  const makeupDays = quarter.days.filter(d => d.is_makeup_day).length
  const regularDays = quarter.days.length - closedDays

  function handleSetActive() {
    startTransition(() => setQuarterActive(quarter.id))
  }

  return (
    <div className="border border-[#c4c6d1]/40 rounded-lg overflow-hidden mb-3">
      {/* Quarter header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-[#f7f9fc] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#191c1e]">{quarter.label}</span>
          {quarter.is_active && (
            <span className="text-xs bg-[#002058] text-white px-2 py-0.5 rounded font-semibold">Active</span>
          )}
          <span className="text-xs text-[#444650]">
            {quarter.start_date} – {quarter.end_date}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-xs text-[#444650]">
            <span>{regularDays} open days</span>
            {closedDays > 0 && <span className="text-red-600">{closedDays} closed</span>}
            {makeupDays > 0 && <span className="text-sky-600">{makeupDays} makeup</span>}
          </div>
          {!quarter.is_active && (
            <button
              onClick={e => { e.stopPropagation(); handleSetActive() }}
              disabled={pending}
              className="text-xs text-[#002058] font-semibold hover:underline disabled:opacity-50"
            >
              Set Active
            </button>
          )}
          <span className="text-[#c4c6d1] text-sm">{open ? '▴' : '▾'}</span>
        </div>
      </div>

      {/* Day list */}
      {open && (
        <div className="border-t border-[#c4c6d1]/30">
          {/* Column headers */}
          <div className="flex text-[10px] font-semibold text-[#444650] uppercase tracking-wide px-3 py-1.5 bg-[#f7f9fc] border-b border-[#c4c6d1]/30">
            <span className="w-36">Date</span>
            <span className="w-20 text-center">Status</span>
            <span className="w-20 text-center">Makeup</span>
            <span className="flex-1">Note</span>
          </div>
          {Array.from(byMonth.entries()).map(([month, days]) => (
            <MonthGroup key={month} label={month} days={days} quarterId={quarter.id} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CalendarManagement({ quarters }: Props) {
  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-xs text-[#444650] mt-0.5">
            Click a quarter to expand. Toggle days open/closed or mark as makeup days.
            Only one quarter can be active at a time.
          </p>
        </div>
      </div>

      {quarters.length === 0 ? (
        <div className="text-sm text-[#444650] py-8 text-center">No quarters seeded yet.</div>
      ) : (
        quarters.map(q => <QuarterPanel key={q.id} quarter={q} />)
      )}
    </div>
  )
}
