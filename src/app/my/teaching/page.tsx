import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InstructorLessonCard, { type InstructorLesson, type HorseOption } from './_components/InstructorLessonCard'
import WorkloadBar, { type HorseWorkload } from './_components/WorkloadBar'
import WeekPicker from './_components/WeekPicker'
import ViewToggle from './_components/ViewToggle'
import FullDayLessonRow, { type FullDayLesson } from './_components/FullDayLessonRow'
import AvailabilityEditor, { type AvailabilityWindow } from './_components/AvailabilityEditor'
import { displayName } from '@/lib/displayName'

export const metadata = { title: 'My Teaching — Marlboro Ridge Equestrian Center' }

function formatSlot(day: string | null, time: string | null): string | null {
  if (!day || !time) return null
  const [h, m] = time.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day}s · ${timeStr}`
}

function mondayOf(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function toDateParam(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string) {
  // Parse HH:mm directly from the ISO string rather than going through Date(),
  // because scheduled_at is a naive timestamp (no TZ offset) and new Date()
  // on a bare "YYYY-MM-DDTHH:mm:ss" string uses the server's local TZ — which
  // is UTC on Vercel and Eastern on a dev Mac, causing a 4-hour skew in prod.
  // The barn is always Eastern; the stored time IS the displayed time.
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1], 10)
  const mm = m[2]
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${mm} ${ampm}`
}

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default async function TeachingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')
  if (!user.isInstructor && !user.isAdmin) redirect('/my/schedule')

  const db  = createAdminClient()
  const now = new Date()

  const { week, view: viewRaw } = await searchParams
  const view: 'mine' | 'all' | 'availability' =
    viewRaw === 'all' ? 'all' : viewRaw === 'availability' ? 'availability' : 'mine'

  const currentWeekMonday = mondayOf(now)
  const weekMonday = week ? mondayOf(new Date(week + 'T00:00:00')) : currentWeekMonday
  const weekStart = new Date(weekMonday)
  const weekEnd = new Date(weekMonday); weekEnd.setDate(weekEnd.getDate() + 7)

  const weekStartParam = toDateParam(weekMonday)
  const isCurrentWeek = weekStartParam === toDateParam(currentWeekMonday)

  // ── Query lessons (mine or all) ─────────────────────────────────────────
  const lessonQuery = db
    .from('lesson')
    .select(`
      id, scheduled_at, lesson_type, duration_minutes, status, instructor_id, notes,
      instructor:person!instructor_id ( id, first_name, preferred_name ),
      lesson_rider (
        id, cancelled_at, deleted_at,
        horse:horse!horse_id ( id, barn_name ),
        rider:person!rider_id ( id, first_name, last_name, preferred_name, phone, is_minor, guardian_id ),
        subscription:lesson_subscription!subscription_id ( id, subscription_type, lesson_day, lesson_time )
      )
    `)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .gte('scheduled_at', weekStart.toISOString())
    .lt('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  if (view === 'mine') lessonQuery.eq('instructor_id', user.personId)

  const { data: rawLessons } = await lessonQuery

  // Guardians for minor riders (Mine view only; not needed in compact Full Day)
  const guardianIds = view === 'mine' ? Array.from(new Set(
    (rawLessons ?? []).flatMap(l => {
      const riders = Array.isArray(l.lesson_rider) ? l.lesson_rider : []
      return riders.map((lr: any) => {
        const r = Array.isArray(lr.rider) ? lr.rider[0] : lr.rider
        return r?.is_minor && r?.guardian_id ? r.guardian_id : null
      }).filter(Boolean) as string[]
    })
  )) : []

  const { data: guardians } = guardianIds.length
    ? await db.from('person').select('id, first_name, last_name, preferred_name, phone').in('id', guardianIds)
    : { data: [] }

  const guardianMap = new Map((guardians ?? []).map(g => [
    g.id,
    { name: displayName(g as any), phone: g.phone },
  ]))

  const riderIds = view === 'mine' ? Array.from(new Set(
    (rawLessons ?? []).flatMap(l => {
      const riders = Array.isArray(l.lesson_rider) ? l.lesson_rider : []
      return riders.map((lr: any) => {
        const r = Array.isArray(lr.rider) ? lr.rider[0] : lr.rider
        return r?.id as string | undefined
      }).filter(Boolean) as string[]
    })
  )) : []

  const { data: tokens } = riderIds.length
    ? await db.from('makeup_token').select('rider_id').in('rider_id', riderIds).eq('status', 'available').is('scheduled_lesson_id', null)
    : { data: [] }

  const tokenCountMap = new Map<string, number>()
  for (const t of tokens ?? []) {
    tokenCountMap.set(t.rider_id, (tokenCountMap.get(t.rider_id) ?? 0) + 1)
  }

  // ── Shape into Mine or FullDay objects ──────────────────────────────────
  const myLessons: InstructorLesson[] = []
  const fullDayLessons: FullDayLesson[] = []

  for (const l of rawLessons ?? []) {
    const lrs = (Array.isArray(l.lesson_rider) ? l.lesson_rider : []) as any[]
    const activeRiders = lrs.filter((lr: any) => !lr.cancelled_at && !lr.deleted_at)
    const instructor = Array.isArray((l as any).instructor) ? (l as any).instructor[0] : (l as any).instructor
    const instructorName = instructor?.preferred_name ?? instructor?.first_name ?? 'Instructor'
    const isMine = (l as any).instructor_id === user.personId

    if (view === 'mine') {
      myLessons.push({
        lessonId:        l.id,
        scheduledAt:     l.scheduled_at,
        lessonType:      l.lesson_type as InstructorLesson['lessonType'],
        durationMinutes: l.duration_minutes ?? 30,
        isFuture:        new Date(l.scheduled_at) > now,
        notes:           (l as any).notes ?? null,
        riders: activeRiders.map((lr: any) => {
          const r    = Array.isArray(lr.rider)        ? lr.rider[0]        : lr.rider
          const h    = Array.isArray(lr.horse)        ? lr.horse[0]        : lr.horse
          const sub  = Array.isArray(lr.subscription) ? lr.subscription[0] : lr.subscription
          const guardian = r?.guardian_id ? guardianMap.get(r.guardian_id) : null
          return {
            lrId:             lr.id,
            name:             r ? displayName(r as any) : 'Rider',
            phone:            r?.phone ?? null,
            isMinor:          r?.is_minor ?? false,
            guardianName:     guardian?.name ?? null,
            guardianPhone:    guardian?.phone ?? null,
            horseId:          h?.id ?? null,
            horseName:        h?.barn_name ?? null,
            subscriptionType: sub?.subscription_type ?? null,
            subscriptionSlot: formatSlot(sub?.lesson_day ?? null, sub?.lesson_time ?? null),
            makeupTokenCount: r?.id ? (tokenCountMap.get(r.id) ?? 0) : 0,
          }
        }),
      })
    } else {
      fullDayLessons.push({
        lessonId:       l.id,
        scheduledAt:    l.scheduled_at,
        instructorName,
        isMine,
        lessonType:     l.lesson_type as FullDayLesson['lessonType'],
        riders: activeRiders.map((lr: any) => {
          const r = Array.isArray(lr.rider) ? lr.rider[0] : lr.rider
          const h = Array.isArray(lr.horse) ? lr.horse[0] : lr.horse
          return {
            name:      r ? displayName(r as any) : 'Rider',
            horseName: h?.barn_name ?? null,
          }
        }),
      })
    }
  }

  // Group by day of week
  const myByDay: InstructorLesson[][] = [[], [], [], [], [], [], []]
  for (const l of myLessons) {
    const d = new Date(l.scheduledAt)
    const idx = d.getDay() === 0 ? 6 : d.getDay() - 1
    myByDay[idx].push(l)
  }

  const fullByDay: FullDayLesson[][] = [[], [], [], [], [], [], []]
  for (const l of fullDayLessons) {
    const d = new Date(l.scheduledAt)
    const idx = d.getDay() === 0 ? 6 : d.getDay() - 1
    fullByDay[idx].push(l)
  }

  // ── Horse options (for Mine view picker) ─────────────────────────────────
  const { data: allHorses } = view === 'mine'
    ? await db.from('horse').select('id, barn_name, lesson_horse').eq('status', 'active').is('deleted_at', null).order('barn_name')
    : { data: [] }

  const horseOptions: HorseOption[] = [
    ...(allHorses ?? []).filter(h => h.lesson_horse).map(h => ({ id: h.id, barnName: h.barn_name, isLessonHorse: true })),
    ...(allHorses ?? []).filter(h => !h.lesson_horse).map(h => ({ id: h.id, barnName: h.barn_name, isLessonHorse: false })),
  ]

  // ── Horse workload bar ───────────────────────────────────────────────────
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00'
  const weekAgoStr = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()

  const [lessonHorsesRes, todayLessonsRes, weekLessonsRes] = await Promise.all([
    db.from('horse').select('id, barn_name').eq('lesson_horse', true).eq('status', 'active').is('deleted_at', null).order('barn_name'),
    db.from('lesson').select('id, lesson_rider!lesson_rider_lesson_id_fkey(horse_id, cancelled_at)').is('deleted_at', null).not('status', 'in', '("cancelled_rider","cancelled_barn")').gte('scheduled_at', todayStart).lte('scheduled_at', now.toISOString().slice(0, 10) + 'T23:59:59'),
    db.from('lesson').select('id, lesson_rider!lesson_rider_lesson_id_fkey(horse_id, cancelled_at)').is('deleted_at', null).not('status', 'in', '("cancelled_rider","cancelled_barn")').gte('scheduled_at', weekAgoStr).lt('scheduled_at', todayStart),
  ])

  const lessonHorses = lessonHorsesRes.data ?? []
  const todayCountMap = new Map<string, number>()
  for (const lesson of todayLessonsRes.data ?? []) {
    const lrs = Array.isArray((lesson as any).lesson_rider) ? (lesson as any).lesson_rider : []
    for (const lr of lrs) if (lr.horse_id && !lr.cancelled_at) todayCountMap.set(lr.horse_id, (todayCountMap.get(lr.horse_id) ?? 0) + 1)
  }
  const weekCountMap = new Map<string, number>()
  for (const lesson of weekLessonsRes.data ?? []) {
    const lrs = Array.isArray((lesson as any).lesson_rider) ? (lesson as any).lesson_rider : []
    for (const lr of lrs) if (lr.horse_id && !lr.cancelled_at) weekCountMap.set(lr.horse_id, (weekCountMap.get(lr.horse_id) ?? 0) + 1)
  }

  const workload: HorseWorkload[] = lessonHorses.map(h => ({
    id: h.id, barnName: h.barn_name,
    todayCount: todayCountMap.get(h.id) ?? 0,
    weekCount:  weekCountMap.get(h.id) ?? 0,
    schedulingNote: null,
  }))

  const todayParam = toDateParam(now)

  // ── Availability (only fetched when that view is active) ────────────────
  let availability: AvailabilityWindow[] = []
  if (view === 'availability') {
    const { data } = await db
      .from('instructor_availability')
      .select('id, day_of_week, start_time, end_time')
      .eq('person_id', user.personId)
      .is('deleted_at', null)
      .order('day_of_week')
      .order('start_time')
    availability = (data ?? []).map(r => ({
      id:        r.id,
      day:       r.day_of_week as AvailabilityWindow['day'],
      startTime: (r.start_time as string).slice(0, 5),
      endTime:   (r.end_time as string).slice(0, 5),
    }))
  }

  if (view === 'availability') {
    return (
      <div className="space-y-2 pb-16">
        <ViewToggle view={view} week={weekStartParam} />
        <AvailabilityEditor windows={availability} />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 pb-16">
        <WeekPicker weekStart={weekStartParam} isCurrentWeek={isCurrentWeek} />
        <ViewToggle view={view} week={weekStartParam} />

        {Array.from({ length: 7 }).map((_, i) => {
          const date = new Date(weekMonday)
          date.setDate(date.getDate() + i)
          const isToday = toDateParam(date) === todayParam
          const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          // Group Full Day lessons by exact time string to highlight concurrency
          const grouped: Record<string, FullDayLesson[]> = {}
          const timeOrder: string[] = []
          if (view === 'all') {
            for (const l of fullByDay[i]) {
              const key = l.scheduledAt
              if (!grouped[key]) { grouped[key] = []; timeOrder.push(key) }
              grouped[key].push(l)
            }
          }

          const isEmpty = view === 'mine' ? myByDay[i].length === 0 : fullByDay[i].length === 0

          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-baseline gap-2 px-1 pt-1">
                <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-secondary' : 'text-on-surface-muted'}`}>
                  {DAY_LABELS[i]}
                </span>
                <span className="text-xs text-on-surface-muted">{dateLabel}</span>
                {isToday && <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Today</span>}
              </div>

              {isEmpty ? (
                <div className="bg-surface-lowest/40 rounded-lg px-4 py-2">
                  <p className="text-xs text-on-surface-muted italic">No lessons</p>
                </div>
              ) : view === 'mine' ? (
                myByDay[i].map(l => <InstructorLessonCard key={l.lessonId} lesson={l} horses={horseOptions} />)
              ) : (
                timeOrder.map(t => (
                  <div key={t} className="space-y-1">
                    <div className="flex items-baseline gap-2 px-1">
                      <span className="text-sm font-bold text-on-surface">{formatTime(t)}</span>
                      {grouped[t].length > 1 && (
                        <span className="text-[10px] font-bold text-warning uppercase tracking-wider">
                          {grouped[t].length} concurrent
                        </span>
                      )}
                    </div>
                    {grouped[t].map(l => <FullDayLessonRow key={l.lessonId} lesson={l} />)}
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>

      <WorkloadBar horses={workload} />
    </>
  )
}
