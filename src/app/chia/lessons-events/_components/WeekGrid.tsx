'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import InstructorLegend from './InstructorLegend'

// Grid geometry. Kept as tunable constants so we can adjust density later.
const START_HOUR      = 7      // 7 AM
const END_HOUR        = 21     // 9 PM (exclusive; grid draws up to 21:00 line)
const PIXELS_PER_HOUR = 60
const TOTAL_HOURS     = END_HOUR - START_HOUR
const GRID_HEIGHT     = TOTAL_HOURS * PIXELS_PER_HOUR
const SNAP_MINUTES    = 30     // click snaps to nearest half hour

export type GridLessonStatus =
  | 'scheduled'
  | 'pending'
  | 'completed'
  | 'cancelled_rider'
  | 'cancelled_barn'
  | 'no_show'

export type GridLesson = {
  id:                  string
  dayIdx:              number    // 0 = Mon .. 6 = Sun
  minutesFromMidnight: number    // 0..1439
  durationMinutes:     number
  effStatus:           GridLessonStatus
  lessonType:          'private' | 'semi_private' | 'group'
  cancelled:           boolean
  riderNames:          string    // full form, used at totalCols === 1
  riderNamesShort:     string    // compact form for 2+ columns
  instructorName:      string    // full name, for tooltip only (stripe carries it visually)
  instructorInitials:  string    // "PM" — shown inside the colored stripe
  instructorColor:     string    // hex color for the stripe
  horseName:           string | null
}

// Events render on the same grid as lessons but have their own visual language.
// Full-column width (no column negotiation with lessons in v1), colored using
// the event_type.calendar_color, topped with the calendar_badge pill. They're
// drawn BEFORE lessons so lesson cards paint on top on overlap — keeping the
// rider/instructor-focused lesson view readable.
export type GridEvent = {
  id:                  string
  dayIdx:              number    // 0 = Mon .. 6 = Sun
  minutesFromMidnight: number
  durationMinutes:     number
  title:               string
  typeLabel:           string     // "Birthday Party", "Clinic", etc.
  calendarColor:       string     // hex, e.g. '#e89c3a'
  calendarBadge:       string     // short label, e.g. 'BDAY'
  cancelled:           boolean
}

export type InstructorKey = {
  id:          string
  name:        string
  initials:    string
  color:       string
  hasOverride: boolean   // true when person.calendar_color is set (not a hash default)
}

export type GridDay = {
  iso:     string         // YYYY-MM-DD
  weekday: string         // "Mon"
  dayNum:  number         // 1..31
  isToday: boolean
  closed:  boolean
  makeup:  boolean
  notes:   string | null
}

type Props = {
  days:        GridDay[]      // length 7, Monday-first
  lessons:     GridLesson[]
  events:      GridEvent[]
  instructors: InstructorKey[]
}

// Card body style by status. Pending is deliberately the SAME as scheduled —
// color on the body is reserved for other signals (cancelled, completed). The
// UNPAID lozenge in the card header carries the pending signal on its own.
const STATUS_STYLE: Record<GridLessonStatus, string> = {
  scheduled:       'bg-white border-[#002058]/40',
  pending:         'bg-white border-[#002058]/40',
  completed:       'bg-[#f0f4fa] border-[#c4c6d1] opacity-70',
  cancelled_rider: 'bg-white border-[#ffd6d6] opacity-50 line-through',
  cancelled_barn:  'bg-white border-[#ffd6d6] opacity-50 line-through',
  no_show:         'bg-[#fff4d6] border-[#7a5a00]/50',
}

function hourLabel(h: number) {
  const per = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${per}`
}

function fmtHHMM(minutes: number) {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  const per = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${per}`
}

function fmtTimeLabel(time: string) {
  // "16:30" → "4:30 PM"
  const [hhS, mmS] = time.split(':')
  const hh = Number(hhS)
  const mm = Number(mmS)
  return fmtHHMM(hh * 60 + mm)
}

const DAY_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function dayOfWeekFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return DAY_OF_WEEK[date.getDay()]
}

function fmtDateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Lay out overlapping lessons side-by-side.
// Algorithm: sort by start time; group into "clusters" where each cluster is a
// run of lessons that transitively overlap. Within a cluster, greedily assign
// each lesson to the first column whose last-occupant ends at/before this one
// starts. The cluster's totalCols is the max column index used. Each lesson
// gets { col, totalCols } — width = 1/totalCols, left = col/totalCols.
type LaidOut = GridLesson & { col: number; totalCols: number }

function layoutDay(dayLessons: GridLesson[]): LaidOut[] {
  if (dayLessons.length === 0) return []
  const sorted = [...dayLessons].sort((a, b) => {
    if (a.minutesFromMidnight !== b.minutesFromMidnight) {
      return a.minutesFromMidnight - b.minutesFromMidnight
    }
    // Longer first on ties so the tall card takes the left column
    return b.durationMinutes - a.durationMinutes
  })

  const result: LaidOut[] = []
  let cluster: { lesson: GridLesson; col: number }[] = []
  let clusterEnd = -1  // latest end time in the current cluster

  const flush = () => {
    const totalCols = cluster.reduce((m, c) => Math.max(m, c.col + 1), 1)
    for (const { lesson, col } of cluster) {
      result.push({ ...lesson, col, totalCols })
    }
    cluster = []
    clusterEnd = -1
  }

  for (const l of sorted) {
    const start = l.minutesFromMidnight
    const end   = start + l.durationMinutes

    if (cluster.length > 0 && start >= clusterEnd) {
      // Disjoint from current cluster — flush and start fresh
      flush()
    }

    // Assign to lowest column whose occupants all end <= start
    const colEnds: number[] = []
    for (const c of cluster) {
      const cEnd = c.lesson.minutesFromMidnight + c.lesson.durationMinutes
      colEnds[c.col] = Math.max(colEnds[c.col] ?? 0, cEnd)
    }
    let col = 0
    while ((colEnds[col] ?? 0) > start) col++

    cluster.push({ lesson: l, col })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length > 0) flush()

  return result
}

type Popover = {
  dayIdx: number
  iso:    string
  time:   string   // "HH:MM"
  yPx:    number   // y-offset within the day column's grid body
}

export default function WeekGrid({ days, lessons, events, instructors }: Props) {
  const router = useRouter()
  const [popover, setPopover] = useState<Popover | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Dismiss the popover on outside click / Escape
  useEffect(() => {
    if (!popover) return
    function handleDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopover(null)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [popover])

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, day: GridDay, dayIdx: number) {
    if (day.closed) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y    = e.clientY - rect.top
    const minutesFromGridTop = (y / PIXELS_PER_HOUR) * 60
    const totalMinutes       = START_HOUR * 60 + minutesFromGridTop
    const snapped = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES
    const hh      = String(Math.floor(snapped / 60)).padStart(2, '0')
    const mm      = String(snapped % 60).padStart(2, '0')
    // Snap the visual anchor to the same half-hour grid line
    const snappedY = ((snapped - START_HOUR * 60) / 60) * PIXELS_PER_HOUR
    setPopover({ dayIdx, iso: day.iso, time: `${hh}:${mm}`, yPx: snappedY })
  }

  function goProduct() {
    if (!popover) return
    router.push(`/chia/lessons-events/products/new?date=${popover.iso}&time=${popover.time}`)
  }

  function goSubscription() {
    if (!popover) return
    const day = dayOfWeekFromIso(popover.iso)
    router.push(`/chia/lessons-events/subscriptions/new?startDate=${popover.iso}&time=${popover.time}&day=${day}`)
  }

  function goMakeup() {
    if (!popover) return
    router.push(`/chia/lessons-events/makeups/new?date=${popover.iso}&time=${popover.time}`)
  }

  function goEvent() {
    if (!popover) return
    router.push(`/chia/lessons-events/events/new?date=${popover.iso}&time=${popover.time}`)
  }

  return (
    <div className="bg-white rounded-lg border border-[#c4c6d1]/40 overflow-hidden">
      <div className="flex">
        {/* Time axis column */}
        <div className="flex-none w-12 border-r border-[#c4c6d1]/30 bg-[#f7f9fc]">
          <div className="h-14 border-b border-[#c4c6d1]/30" />
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-full text-[9px] font-semibold text-[#444650] text-right pr-1 leading-none"
                style={{ top: i * PIXELS_PER_HOUR - 4 }}
              >
                {i < TOTAL_HOURS ? hourLabel(START_HOUR + i) : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        <div className="flex-1 grid grid-cols-7">
          {days.map((day, dayIdx) => {
            const dayLessons = layoutDay(lessons.filter(l => l.dayIdx === dayIdx))
            const dayEvents  = events.filter(e => e.dayIdx === dayIdx)
            return (
              <div
                key={day.iso}
                className={`border-l border-[#c4c6d1]/20 ${day.isToday ? 'bg-[#dae2ff]/5' : ''}`}
              >
                {/* Day header */}
                <div className={`h-14 border-b border-[#c4c6d1]/30 px-2 py-1 flex flex-col justify-center ${day.isToday ? 'bg-[#002058] text-white' : 'bg-[#f7f9fc] text-[#191c1e]'}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80 leading-none">{day.weekday}</div>
                  <div className="text-sm font-bold leading-tight">{day.dayNum}</div>
                  {(day.closed || day.makeup) && (
                    <div className={`text-[8px] font-bold uppercase tracking-wide leading-none ${day.isToday ? 'text-white/90' : day.closed ? 'text-[#8a1a1a]' : 'text-[#4a1a8c]'}`}>
                      {day.closed ? 'Closed' : 'Makeup'}
                    </div>
                  )}
                </div>

                {/* Grid body — clickable for create-at-time, unless closed */}
                <div
                  className={`relative ${day.closed ? 'bg-[#ffd6d6]/15 cursor-not-allowed' : 'cursor-pointer hover:bg-[#dae2ff]/10'} transition-colors`}
                  style={{ height: GRID_HEIGHT }}
                  onClick={day.closed ? undefined : (e) => handleColumnClick(e, day, dayIdx)}
                  title={day.closed
                    ? (day.notes ? `Barn closed: ${day.notes}` : 'Barn closed')
                    : 'Click to create a lesson at this time'}
                >
                  {/* Hour grid lines */}
                  {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
                    <div
                      key={`hr-${i}`}
                      className="absolute left-0 right-0 border-t border-[#c4c6d1]/25"
                      style={{ top: i * PIXELS_PER_HOUR }}
                    />
                  ))}
                  {/* Half-hour grid lines (fainter) */}
                  {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                    <div
                      key={`half-${i}`}
                      className="absolute left-0 right-0 border-t border-dashed border-[#c4c6d1]/15"
                      style={{ top: i * PIXELS_PER_HOUR + PIXELS_PER_HOUR / 2 }}
                    />
                  ))}

                  {/* Event cards — drawn first so lessons render on top on overlap.
                      Full column width, colored by event_type.calendar_color. */}
                  {dayEvents.map(ev => {
                    const top    = ((ev.minutesFromMidnight - START_HOUR * 60) / 60) * PIXELS_PER_HOUR
                    const height = (ev.durationMinutes / 60) * PIXELS_PER_HOUR
                    const tooltipParts = [
                      fmtHHMM(ev.minutesFromMidnight),
                      `${ev.durationMinutes}min`,
                      ev.typeLabel,
                      ev.title,
                    ].filter(Boolean).join(' · ')
                    return (
                      <Link
                        key={`evt-${ev.id}`}
                        href={`/chia/lessons-events/events/${ev.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute rounded overflow-hidden text-[10px] leading-tight hover:shadow-md transition-shadow ${ev.cancelled ? 'opacity-40 line-through' : ''}`}
                        style={{
                          top,
                          height,
                          left:            'calc(2px)',
                          width:           'calc(100% - 4px)',
                          backgroundColor: `${ev.calendarColor}26`,   // ~15% alpha fill
                          borderLeft:      `3px solid ${ev.calendarColor}`,
                        }}
                        title={tooltipParts}
                      >
                        <div className="px-1 py-0.5">
                          <div className="flex items-center gap-1">
                            <span
                              className="text-[8px] font-bold text-white px-1 rounded flex-none"
                              style={{ backgroundColor: ev.calendarColor }}
                            >
                              {ev.calendarBadge}
                            </span>
                            <span className="font-semibold text-[#191c1e] truncate">
                              {ev.title}
                            </span>
                          </div>
                          {ev.durationMinutes >= 60 && (
                            <div className="text-[#444650] truncate italic mt-0.5">
                              {ev.typeLabel}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}

                  {/* Lesson cards (absolute positioned by time + column) */}
                  {dayLessons.map(l => {
                    const top    = ((l.minutesFromMidnight - START_HOUR * 60) / 60) * PIXELS_PER_HOUR
                    const height = (l.durationMinutes / 60) * PIXELS_PER_HOUR
                    const style  = STATUS_STYLE[l.effStatus]
                    // Column-based horizontal slot. 2px inset on each side of the
                    // column so cards don't touch each other or the column edges.
                    const widthPct = 100 / l.totalCols
                    const leftPct  = l.col * widthPct

                    // Instructor stripe: wide stripe with initials when card has
                    // horizontal room; thin color-only bar when squeezed into 3+
                    // columns (not enough space for text + rider name).
                    const wideStripe = l.totalCols <= 2
                    const stripeWidth = wideStripe ? 20 : 6

                    // Compact rider names (e.g. "Alice S.") for 2+ column cards
                    // since we no longer have horizontal slack for full names.
                    const riderText = l.totalCols === 1
                      ? (l.riderNames || '(no rider)')
                      : (l.riderNamesShort || l.riderNames || '(no rider)')

                    // Horse line only at full width + tall enough (60min+).
                    // Instructor line dropped entirely — the stripe now carries
                    // that identity at all sizes.
                    const showHorse = l.durationMinutes >= 60 && l.totalCols === 1 && Boolean(l.horseName)

                    const tooltipParts = [
                      fmtHHMM(l.minutesFromMidnight),
                      `${l.durationMinutes}min`,
                      l.riderNames || '(no rider)',
                      l.instructorName,
                      l.horseName,
                    ].filter(Boolean).join(' · ')

                    return (
                      <Link
                        key={l.id}
                        href={`/chia/lessons-events/${l.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute rounded border overflow-hidden text-[10px] leading-tight hover:shadow-md hover:z-10 transition-shadow ${style}`}
                        style={{
                          top,
                          height,
                          left:  `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                        title={tooltipParts}
                      >
                        <div className="flex h-full">
                          {/* Instructor color stripe + initials */}
                          <div
                            className="flex-none flex items-center justify-center text-white font-bold"
                            style={{
                              width:           stripeWidth,
                              backgroundColor: l.instructorColor,
                              fontSize:        wideStripe ? 10 : 0,  // hide text when stripe is thin
                              letterSpacing:   wideStripe ? '0.5px' : undefined,
                            }}
                          >
                            {wideStripe ? l.instructorInitials : ''}
                          </div>

                          {/* Body: rider + optional horse */}
                          <div className="flex-1 min-w-0 px-1 py-0.5">
                            <div className={`font-semibold text-[#191c1e] truncate flex items-center gap-1 ${l.cancelled ? 'text-[#8a1a1a]' : ''}`}>
                              {l.effStatus === 'pending' && (
                                <span
                                  className="text-[8px] font-bold bg-[#7a5a00] text-white px-1 rounded flex-none"
                                  title="Pending (unpaid subscription or rider missing a waiver)"
                                >
                                  {l.totalCols >= 3 ? '!' : 'PENDING'}
                                </span>
                              )}
                              {l.lessonType !== 'private' && (
                                <span
                                  className="text-[8px] font-bold bg-[#002058] text-white px-1 rounded flex-none"
                                  title={l.lessonType === 'semi_private' ? 'Semi-Private' : 'Group'}
                                >
                                  {l.lessonType === 'semi_private' ? 'SEMI' : 'GRP'}
                                </span>
                              )}
                              <span className="truncate">
                                {riderText}
                              </span>
                            </div>
                            {showHorse && (
                              <div className="text-[#444650] truncate italic">{l.horseName}</div>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}

                  {/* Click popover — rendered inside the clicked day's column */}
                  {popover && popover.dayIdx === dayIdx && (
                    <div
                      ref={popoverRef}
                      className="absolute left-1 right-1 z-20 bg-white border border-[#002058] shadow-lg rounded-lg p-2 text-[11px]"
                      style={{ top: Math.max(0, Math.min(popover.yPx, GRID_HEIGHT - 160)) }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="font-semibold text-[#191c1e]">
                          {fmtDateLabel(popover.iso)} · {fmtTimeLabel(popover.time)}
                        </div>
                        <button
                          onClick={() => setPopover(null)}
                          className="text-[#444650] hover:text-[#191c1e] text-sm leading-none px-1"
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={goProduct}
                          className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
                        >
                          <div className="font-semibold text-[#002058]">New lesson</div>
                          <div className="text-[10px] text-[#444650]">Evaluation · Extra lesson</div>
                        </button>
                        <button
                          onClick={goEvent}
                          className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
                        >
                          <div className="font-semibold text-[#002058]">New event</div>
                          <div className="text-[10px] text-[#444650]">Birthday party · Clinic · Therapy · Other</div>
                        </button>
                        <button
                          onClick={goSubscription}
                          className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
                        >
                          <div className="font-semibold text-[#002058]">New subscription</div>
                          <div className="text-[10px] text-[#444650]">Recurring weekly slot this quarter</div>
                        </button>
                        <button
                          onClick={goMakeup}
                          className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
                        >
                          <div className="font-semibold text-[#002058]">Schedule makeup</div>
                          <div className="text-[10px] text-[#444650]">Redeem an available token</div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-[#c4c6d1]/30 bg-[#f7f9fc] px-3 py-1.5 text-[10px] text-[#444650]">
        {/* Instructor key — click a badge to change that instructor's color */}
        {instructors.length > 0 && <InstructorLegend instructors={instructors} />}

        {/* Status key */}
        <div className="flex items-center gap-4 flex-wrap">
          <span>Click any empty slot to schedule a lesson or subscription.</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded border border-[#002058]/40 bg-white" />
            Scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-flex items-center justify-center text-white font-bold rounded-sm bg-[#7a5a00]"
                  style={{ width: 30, height: 10, fontSize: 7 }}>PENDING</span>
            Pending (unpaid or no waiver)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#f0f4fa] border border-[#c4c6d1]" />
            Completed
          </span>
          <span className="flex items-center gap-1 line-through">
            <span className="inline-block w-3 h-3 rounded bg-white border border-[#ffd6d6]" />
            Cancelled
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#ffd6d6]/50" />
            Closed
          </span>
        </div>
      </div>
    </div>
  )
}
