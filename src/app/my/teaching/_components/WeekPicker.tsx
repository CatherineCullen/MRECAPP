'use client'

import { useRouter } from 'next/navigation'

function fmtRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const mo = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const so = sameMonth
    ? sunday.getDate().toString()
    : sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${mo} – ${so}`
}

function toParam(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function WeekPicker({
  weekStart,
  isCurrentWeek,
}: {
  weekStart: string // YYYY-MM-DD (Monday)
  isCurrentWeek: boolean
}) {
  const router = useRouter()
  const monday = new Date(weekStart + 'T00:00:00')

  function shift(days: number) {
    const d = new Date(monday)
    d.setDate(d.getDate() + days)
    router.push(`/my/teaching?week=${toParam(d)}`)
  }

  return (
    <div className="flex items-center justify-between bg-surface-lowest rounded-lg px-3 py-2 mb-2">
      <button
        onClick={() => shift(-7)}
        className="text-on-secondary-container text-sm font-semibold px-2 py-1"
        aria-label="Previous week"
      >
        ←
      </button>
      <div className="flex flex-col items-center">
        <span className="text-sm font-bold text-on-surface">{fmtRange(monday)}</span>
        {!isCurrentWeek && (
          <button
            onClick={() => router.push('/my/teaching')}
            className="text-[11px] text-on-secondary-container font-semibold uppercase tracking-wide"
          >
            Jump to this week
          </button>
        )}
      </div>
      <button
        onClick={() => shift(7)}
        className="text-on-secondary-container text-sm font-semibold px-2 py-1"
        aria-label="Next week"
      >
        →
      </button>
    </div>
  )
}
