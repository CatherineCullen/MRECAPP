'use client'

import { useState, useTransition } from 'react'
import {
  adminAddAvailabilityWindow,
  adminRemoveAvailabilityWindow,
} from '../actions'

export type AvailabilityWindow = {
  id: string
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  startTime: string  // 'HH:MM'
  endTime: string
}

const DAYS: Array<AvailabilityWindow['day']> = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]
const DAY_LABEL: Record<AvailabilityWindow['day'], string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function AdminAvailabilityEditor({
  instructorPersonId,
  windows,
}: {
  instructorPersonId: string
  windows: AvailabilityWindow[]
}) {
  const byDay = new Map<string, AvailabilityWindow[]>()
  for (const w of windows) {
    if (!byDay.has(w.day)) byDay.set(w.day, [])
    byDay.get(w.day)!.push(w)
  }
  for (const [, arr] of byDay) arr.sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#444650] px-1">
        Edit when this instructor is available to teach. Changes also appear in their My Teaching view. Instructors can edit their own availability directly.
      </p>
      {DAYS.map(day => (
        <DayCard
          key={day}
          instructorPersonId={instructorPersonId}
          day={day}
          label={DAY_LABEL[day]}
          windows={byDay.get(day) ?? []}
        />
      ))}
    </div>
  )
}

function DayCard({
  instructorPersonId,
  day,
  label,
  windows,
}: {
  instructorPersonId: string
  day: AvailabilityWindow['day']
  label: string
  windows: AvailabilityWindow[]
}) {
  const [adding, setAdding] = useState(false)
  const [start, setStart]   = useState('09:00')
  const [end,   setEnd]     = useState('17:00')
  const [error, setError]   = useState<string | null>(null)
  const [pending, start_]   = useTransition()

  function handleAdd() {
    setError(null)
    start_(async () => {
      const res = await adminAddAvailabilityWindow(instructorPersonId, day, start, end)
      if (res.error) { setError(res.error); return }
      setAdding(false)
    })
  }

  function handleRemove(id: string) {
    start_(async () => {
      await adminRemoveAvailabilityWindow(id)
    })
  }

  return (
    <div className="bg-white border border-[#c4c6d1]/40 rounded-lg px-4 py-3">
      <p className="text-xs font-bold text-[#444650] uppercase tracking-wide">{label}</p>

      {windows.length === 0 && !adding && (
        <p className="text-xs text-[#444650] italic mt-1">Not available</p>
      )}

      {windows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {windows.map(w => (
            <span
              key={w.id}
              className="inline-flex items-center gap-1.5 bg-[#f0f2f7] rounded px-2 py-1 text-xs font-semibold text-[#191c1e]"
            >
              {formatTime(w.startTime)} – {formatTime(w.endTime)}
              <button
                onClick={() => handleRemove(w.id)}
                disabled={pending}
                className="text-[#444650] hover:text-[#b3261e] disabled:opacity-50"
                aria-label="Remove window"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {adding ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={start}
              onChange={e => setStart(e.target.value)}
              className="bg-[#f0f2f7] rounded px-2 py-1.5 text-sm text-[#191c1e] focus:outline-none"
            />
            <span className="text-[#444650] text-sm">to</span>
            <input
              type="time"
              value={end}
              onChange={e => setEnd(e.target.value)}
              className="bg-[#f0f2f7] rounded px-2 py-1.5 text-sm text-[#191c1e] focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-[#b3261e]">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={pending}
              className="bg-[#002058] text-white text-sm font-semibold px-3 py-1.5 rounded disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null) }}
              className="text-sm font-semibold text-[#002058]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs font-semibold text-[#002058] mt-1.5"
        >
          + Add window
        </button>
      )}
    </div>
  )
}
