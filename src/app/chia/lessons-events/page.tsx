import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import WeekPicker from './_components/WeekPicker'
import WeekGrid, { type GridDay, type GridLesson, type GridLessonStatus, type GridEvent, type InstructorKey } from './_components/WeekGrid'
import { toISODate, startOfWeek, weekDays, parseISODate } from './_lib/weekRange'
import { effectiveStatus, type RawStatus } from './_lib/effectiveLessonStatus'
import { displayName, shortName, personInitials } from '@/lib/displayName'
import { instructorColor, UNASSIGNED_COLOR } from './_lib/instructorColor'

export default async function LessonsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams

  const anchor = params.week ? parseISODate(params.week) : new Date()
  const monday    = startOfWeek(anchor)
  const mondayIso = toISODate(monday)
  const days      = weekDays(monday)
  const sundayIso = toISODate(days[6])

  const windowStart = `${mondayIso}T00:00:00`
  const windowEnd   = `${sundayIso}T23:59:59`

  const supabase = createAdminClient()
  const [{ data: lessons, error }, { data: calDays, error: calErr }, { data: events, error: evtErr }] = await Promise.all([
    supabase
      .from('lesson')
      .select(`
        id, scheduled_at, lesson_type, duration_minutes, status, notes,
        instructor:person!lesson_instructor_id_fkey ( id, first_name, last_name, preferred_name, calendar_color ),
        lesson_rider (
          id, cancelled_at,
          rider:person!lesson_rider_rider_id_fkey ( id, first_name, last_name, preferred_name ),
          horse:horse                               ( id, barn_name ),
          subscription:lesson_subscription ( id, status )
        )
      `)
      .is('deleted_at', null)
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .order('scheduled_at'),
    supabase
      .from('barn_calendar_day')
      .select('date, barn_closed, is_makeup_day, notes')
      .gte('date', mondayIso)
      .lte('date', sundayIso),
    supabase
      .from('event')
      .select(`
        id, scheduled_at, duration_minutes, title, status,
        type:event_type ( code, label, calendar_color, calendar_badge )
      `)
      .is('deleted_at', null)
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .order('scheduled_at'),
  ])

  if (error)   throw error
  if (calErr)  throw calErr
  if (evtErr)  throw evtErr

  const dayMetaByIso = new Map<string, { closed: boolean; makeup: boolean; notes: string | null }>()
  for (const d of calDays ?? []) {
    dayMetaByIso.set(d.date, { closed: !!d.barn_closed, makeup: !!d.is_makeup_day, notes: d.notes })
  }

  const todayIso = toISODate(new Date())

  // Shape days for the grid
  const gridDays: GridDay[] = days.map(d => {
    const iso  = toISODate(d)
    const meta = dayMetaByIso.get(iso)
    return {
      iso,
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum:  d.getDate(),
      isToday: iso === todayIso,
      closed:  !!meta?.closed,
      makeup:  !!meta?.makeup,
      notes:   meta?.notes ?? null,
    }
  })

  // Shape lessons for the grid
  const gridLessons: GridLesson[] = (lessons ?? []).map(l => {
    const d      = new Date(l.scheduled_at)
    const dow    = d.getDay()                 // 0..6 Sun..Sat
    const dayIdx = dow === 0 ? 6 : dow - 1    // shift to Mon-first
    const minutes = d.getHours() * 60 + d.getMinutes()

    const riders = (l.lesson_rider ?? []).filter(r => !r.cancelled_at)
    const unpaid = riders.some(r => r.subscription?.status === 'pending')

    // Derive effective status. Scheduled + past → completed. Scheduled + unpaid
    // subscription → pending. Explicit terminal statuses are left alone.
    const rawForDisplay: RawStatus = (l.status === 'scheduled' && unpaid) ? 'pending' : (l.status as RawStatus)
    const effStatus = effectiveStatus({ status: rawForDisplay, scheduledAt: l.scheduled_at }) as GridLessonStatus

    return {
      id:                  l.id,
      dayIdx,
      minutesFromMidnight: minutes,
      durationMinutes:     l.duration_minutes ?? 30,
      effStatus,
      lessonType:          (l.lesson_type ?? 'private') as GridLesson['lessonType'],
      cancelled:           effStatus === 'cancelled_rider' || effStatus === 'cancelled_barn',
      riderNames:          riders.map(r => displayName(r.rider)).join(', '),
      // Short form used for 2+ column cards where horizontal room runs out.
      // "Cat" (preferred name) or "Alice S." — matches how staff refer to people.
      riderNamesShort:     riders.map(r => shortName(r.rider)).join(', '),
      instructorName:      displayName(l.instructor),
      instructorInitials:  personInitials(l.instructor),
      // Admin-picked color wins; fall through to deterministic hash.
      instructorColor:     l.instructor?.calendar_color
                             ?? instructorColor(l.instructor?.id ?? null),
      horseName:           riders[0]?.horse?.barn_name ?? null,
    }
  })

  // Shape events for the grid — independent of lesson layout; events render
  // as full-column-width cards underneath lessons so both are visible on a
  // collision. Status 'cancelled' gets a dimmed look.
  const gridEvents: GridEvent[] = (events ?? []).map(e => {
    const d      = new Date(e.scheduled_at)
    const dow    = d.getDay()
    const dayIdx = dow === 0 ? 6 : dow - 1
    const minutes = d.getHours() * 60 + d.getMinutes()
    return {
      id:                  e.id,
      dayIdx,
      minutesFromMidnight: minutes,
      durationMinutes:     e.duration_minutes,
      title:               e.title,
      typeLabel:           e.type?.label ?? 'Event',
      calendarColor:       e.type?.calendar_color ?? '#8c8e98',
      calendarBadge:       e.type?.calendar_badge ?? 'EVT',
      cancelled:           e.status === 'cancelled',
    }
  })

  // Distinct instructors represented on this week's calendar, for the legend.
  // Deduped by id; sorted by display name so the key is stable and scannable.
  const instructorLegend: InstructorKey[] = (() => {
    const byId = new Map<string, InstructorKey>()
    for (const l of lessons ?? []) {
      const instr = l.instructor
      if (!instr?.id) continue
      if (byId.has(instr.id)) continue
      byId.set(instr.id, {
        id:       instr.id,
        name:     displayName(instr),
        initials: personInitials(instr),
        color:    instr.calendar_color ?? instructorColor(instr.id),
        hasOverride: !!instr.calendar_color,
      })
    }
    // If any lesson has no instructor, surface "Unassigned" so the gray stripe
    // has a legend entry to match.
    const anyUnassigned = (lessons ?? []).some(l => !l.instructor?.id)
    if (anyUnassigned) {
      byId.set('__unassigned', {
        id:       '__unassigned',
        name:     'Unassigned',
        initials: '??',
        color:    UNASSIGNED_COLOR,
        hasOverride: false,
      })
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <WeekPicker currentWeekStart={mondayIso} />
        <div className="flex items-center gap-2">
          <Link
            href="/chia/lessons-events/subscriptions"
            className="text-xs text-[#444650] font-semibold px-2.5 py-1.5 rounded hover:bg-[#e8eaf0] hover:text-[#002058] transition-colors"
          >
            Subscriptions
          </Link>
          <Link
            href="/chia/lessons-events/tokens"
            className="text-xs text-[#444650] font-semibold px-2.5 py-1.5 rounded hover:bg-[#e8eaf0] hover:text-[#002058] transition-colors"
          >
            Tokens
          </Link>
          <Link
            href="/chia/lessons-events/products/new"
            className="text-xs text-[#002058] font-semibold border border-[#c4c6d1] bg-white px-3 py-1.5 rounded hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
          >
            + New Lesson
          </Link>
          <Link
            href="/chia/lessons-events/events/new"
            className="text-xs text-[#002058] font-semibold border border-[#c4c6d1] bg-white px-3 py-1.5 rounded hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
          >
            + New Event
          </Link>
          <Link
            href="/chia/lessons-events/makeups/new"
            className="text-xs text-[#002058] font-semibold border border-[#c4c6d1] bg-white px-3 py-1.5 rounded hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
          >
            + Schedule Makeup
          </Link>
          <Link
            href="/chia/lessons-events/subscriptions/new"
            className="text-xs text-[#002058] font-semibold border border-[#c4c6d1] bg-white px-3 py-1.5 rounded hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
          >
            + New Subscription
          </Link>
        </div>
      </div>

      <WeekGrid days={gridDays} lessons={gridLessons} events={gridEvents} instructors={instructorLegend} />
    </div>
  )
}
