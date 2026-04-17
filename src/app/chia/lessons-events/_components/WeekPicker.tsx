'use client'

import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toISODate, shiftWeek, formatWeekLabel, parseISODate, startOfWeek } from '../_lib/weekRange'

type Props = {
  currentWeekStart: string   // ISO date, Monday of the selected week
}

export default function WeekPicker({ currentWeekStart }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const d      = parseISODate(currentWeekStart)
  const prev   = toISODate(shiftWeek(d, -1))
  const next   = toISODate(shiftWeek(d,  1))
  const label  = formatWeekLabel(d)

  // "Today" = current calendar week — computed client-side so it's always fresh
  const todayIso = toISODate(new Date())

  const btnCls   = 'px-2 py-1 text-sm font-semibold text-[#444650] rounded hover:bg-[#e8eaf0] transition-colors'
  const todayCls = 'px-2 py-1 text-xs font-semibold border border-[#c4c6d1] rounded hover:border-[#002058] hover:text-[#002058] transition-colors'

  // Jump to any date → navigate to the Monday of that date's week, preserving
  // other query params (e.g., ?rider=...).
  function handleJump(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value   // 'YYYY-MM-DD'
    if (!v) return
    const monday = toISODate(startOfWeek(parseISODate(v)))
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', monday)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1">
      <Link href={`?week=${prev}`} className={btnCls} aria-label="Previous week">‹</Link>
      <span className="min-w-[180px] text-center text-sm font-semibold text-[#191c1e] px-2">{label}</span>
      <Link href={`?week=${next}`} className={btnCls} aria-label="Next week">›</Link>
      <Link href={`?week=${todayIso}`} className={todayCls}>Today</Link>

      {/* Jump-to-date: click the calendar icon / input to pick any week */}
      <label className="ml-2 flex items-center gap-1 text-xs text-[#444650] font-semibold border border-[#c4c6d1] rounded px-2 py-1 hover:border-[#002058] hover:text-[#002058] transition-colors cursor-pointer" title="Jump to week">
        <span aria-hidden="true">Go to</span>
        <input
          type="date"
          value={currentWeekStart}
          onChange={handleJump}
          className="bg-transparent border-0 text-xs font-semibold focus:outline-none cursor-pointer"
        />
      </label>
    </div>
  )
}
