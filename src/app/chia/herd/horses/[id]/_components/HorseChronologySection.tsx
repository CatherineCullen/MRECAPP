'use client'

import { useEffect, useRef } from 'react'
import type { ChronologyEvent } from '../_lib/loadChronology'

/**
 * Chronology feed — today-anchored, future above, past below. Day
 * headers group events; a "Today" marker is always rendered and is
 * scrolled into view on mount so the viewer lands on today with the
 * near future visible above and recent past below.
 *
 * Read-only — the existing focused sections (Board Services, Vet
 * Records, etc.) keep their specialized actions; this is the
 * "what's happening with this horse" glance.
 */

type Props = {
  events: ChronologyEvent[]
  // Optional — lets callers pass the computed today key so a
  // hypothetical server render uses the same anchor. Defaults to the
  // client's today at mount.
  todayKey?: string
}

const TONE_CLASSES: Record<ChronologyEvent['tone'], string> = {
  default: 'bg-[#e8edf4] text-[#444650]',
  muted:   'bg-[#e0e3e6] text-[#8c8e98] line-through decoration-[#8c8e98]/50',
  info:    'bg-[#dae2ff] text-[#002058]',
  success: 'bg-[#b7f0d0] text-[#1a6b3c]',
  warn:    'bg-[#ffddb3] text-[#7c4b00]',
}

const KIND_LABEL: Record<ChronologyEvent['kind'], string> = {
  lesson:        'Lesson',
  training_ride: 'Training',
  service:       'Service',
}

function formatDayHeader(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

function todayKeyLocal(): string {
  // Use local date, not UTC — "today" for display anchoring should
  // match the viewer's wall clock. ISO-ish YYYY-MM-DD.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function HorseChronologySection({ events, todayKey }: Props) {
  const today = todayKey ?? todayKeyLocal()
  const todayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Bring the Today marker into view on mount. block:'nearest' means
    // no scroll if Today is already visible in the viewport — useful
    // for small horses whose whole chronology fits above the fold. If
    // it's below the fold (lots of past data), it scrolls just enough
    // to show it, leaving the Identity section above still reachable.
    todayRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
  }, [])

  // Group events by dateKey, preserving the descending-order coming
  // from the loader. Inject the Today marker at the right slot.
  type DayGroup = { dateKey: string; events: ChronologyEvent[] }
  const groups: DayGroup[] = []
  for (const ev of events) {
    const last = groups[groups.length - 1]
    if (last && last.dateKey === ev.dateKey) last.events.push(ev)
    else groups.push({ dateKey: ev.dateKey, events: [ev] })
  }

  // Where does Today go? In a descending feed:
  //   - If there are events on today's date: Today marker goes right
  //     above that day's group.
  //   - If not: Today marker goes above the first group whose date is
  //     strictly before today (so it sits between future and past).
  //   - If all events are in the future: Today marker goes at the
  //     bottom.
  //   - If no events: Today marker is the only thing rendered.
  let todayInsertIdx = groups.length
  let todayHasEvents = false
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].dateKey === today) {
      todayInsertIdx = i
      todayHasEvents = true
      break
    }
    if (groups[i].dateKey < today) {
      todayInsertIdx = i
      break
    }
  }

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7]">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Chronology
          <span className="ml-1.5 text-[10px] font-normal text-[#444650] normal-case tracking-normal">
            ({events.length} event{events.length === 1 ? '' : 's'} · past 12 months + upcoming)
          </span>
        </h2>
      </div>

      {events.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <div
            ref={todayRef}
            className="inline-block text-[10px] font-semibold text-[#056380] uppercase tracking-wider px-3 py-1 bg-[#f2f4f7] rounded"
          >
            Today — no activity
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[#f2f4f7] max-h-80 overflow-y-auto">
          {groups.map((g, i) => (
            <div key={g.dateKey}>
              {/* Today marker — rendered above the first strictly-past
                  group, or inline if today has events. */}
              {i === todayInsertIdx && !todayHasEvents && (
                <TodayDivider innerRef={todayRef} />
              )}
              <div
                className={`px-4 py-2.5 ${g.dateKey === today ? 'bg-[#eff2f9]' : ''}`}
                style={{ scrollMarginTop: '4rem' }}
                ref={g.dateKey === today ? todayRef : undefined}
              >
                <div className="flex items-baseline gap-3 mb-1.5">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${g.dateKey === today ? 'text-[#002058]' : 'text-[#444650]'}`}>
                    {g.dateKey === today ? 'Today · ' : ''}{formatDayHeader(g.dateKey)}
                  </h3>
                </div>
                <div className="space-y-1">
                  {g.events.map(ev => (
                    <EventRow key={ev.id} ev={ev} />
                  ))}
                </div>
              </div>
            </div>
          ))}
          {/* If all groups are strictly in the future, Today goes at
              the bottom. */}
          {todayInsertIdx === groups.length && !todayHasEvents && (
            <TodayDivider innerRef={todayRef} />
          )}
        </div>
      )}
    </section>
  )
}

function TodayDivider({ innerRef }: { innerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={innerRef}
      className="px-4 py-2 bg-[#eff2f9] flex items-center gap-2"
      style={{ scrollMarginTop: '4rem' }}
    >
      <div className="flex-1 h-px bg-[#056380]/30" />
      <span className="text-[10px] font-semibold text-[#002058] uppercase tracking-wider">Today</span>
      <div className="flex-1 h-px bg-[#056380]/30" />
    </div>
  )
}

function EventRow({ ev }: { ev: ChronologyEvent }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[10px] font-semibold text-[#8c8e98] uppercase tracking-wider w-16 shrink-0">{KIND_LABEL[ev.kind]}</span>
      {ev.hasTime && (
        <span className="text-[10px] font-mono text-[#444650] w-14 shrink-0">{formatTime(ev.at)}</span>
      )}
      {!ev.hasTime && <span className="w-14 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-[#191c1e] truncate">{ev.title}</div>
        {ev.subtitle && (
          <div className="text-[11px] text-[#444650] truncate">{ev.subtitle}</div>
        )}
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 uppercase tracking-wider ${TONE_CLASSES[ev.tone]}`}>
        {ev.status}
      </span>
    </div>
  )
}
