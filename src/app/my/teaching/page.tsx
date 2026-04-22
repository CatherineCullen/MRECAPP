import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InstructorLessonCard, { type InstructorLesson, type HorseOption } from './_components/InstructorLessonCard'
import WorkloadBar, { type HorseWorkload } from './_components/WorkloadBar'
import WeekPicker from './_components/WeekPicker'

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
  const day = copy.getDay() // 0 = Sun, 1 = Mon
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

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default async function TeachingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')
  if (!user.isInstructor && !user.isAdmin) redirect('/my/schedule')

  const db  = createAdminClient()
  const now = new Date()

  // ── Determine the week window ───────────────────────────────────────────
  const { week } = await searchParams
  const currentWeekMonday = mondayOf(now)
  const weekMonday = week
    ? mondayOf(new Date(week + 'T00:00:00'))
    : currentWeekMonday
  const weekStart = new Date(weekMonday)
  const weekEnd = new Date(weekMonday)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const weekStartParam = toDateParam(weekMonday)
  const isCurrentWeek = weekStartParam === toDateParam(currentWeekMonday)

  // ── Lessons this week where I'm the instructor ──────────────────────────
  const { data: rawLessons } = await db
    .from('lesson')
    .select(`
      id, scheduled_at, lesson_type, duration_minutes, status,
      lesson_rider (
        id, cancelled_at, deleted_at,
        horse:horse!horse_id ( id, barn_name ),
        rider:person!rider_id ( id, first_name, preferred_name, phone, is_minor, guardian_id ),
        subscription:lesson_subscription!subscription_id ( id, subscription_type, lesson_day, lesson_time )
      )
    `)
    .eq('instructor_id', user.personId)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .gte('scheduled_at', weekStart.toISOString())
    .lt('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  // Collect guardian IDs for any minor riders
  const guardianIds = Array.from(new Set(
    (rawLessons ?? []).flatMap(l => {
      const riders = Array.isArray(l.lesson_rider) ? l.lesson_rider : []
      return riders
        .map((lr: any) => {
          const r = Array.isArray(lr.rider) ? lr.rider[0] : lr.rider
          return r?.is_minor && r?.guardian_id ? r.guardian_id : null
        })
        .filter(Boolean) as string[]
    })
  ))

  const { data: guardians } = guardianIds.length
    ? await db.from('person').select('id, first_name, preferred_name, phone').in('id', guardianIds)
    : { data: [] }

  const guardianMap = new Map((guardians ?? []).map(g => [
    g.id,
    { name: g.preferred_name ?? g.first_name, phone: g.phone },
  ]))

  // Count unscheduled makeup tokens per rider
  const riderIds = Array.from(new Set(
    (rawLessons ?? []).flatMap(l => {
      const riders = Array.isArray(l.lesson_rider) ? l.lesson_rider : []
      return riders.map((lr: any) => {
        const r = Array.isArray(lr.rider) ? lr.rider[0] : lr.rider
        return r?.id as string | undefined
      }).filter(Boolean) as string[]
    })
  ))

  const { data: tokens } = riderIds.length
    ? await db
        .from('makeup_token')
        .select('rider_id')
        .in('rider_id', riderIds)
        .eq('status', 'available')
        .is('scheduled_lesson_id', null)
    : { data: [] }

  const tokenCountMap = new Map<string, number>()
  for (const t of tokens ?? []) {
    tokenCountMap.set(t.rider_id, (tokenCountMap.get(t.rider_id) ?? 0) + 1)
  }

  // Shape into InstructorLesson objects
  const lessons: InstructorLesson[] = (rawLessons ?? []).map(l => {
    const lrs = (Array.isArray(l.lesson_rider) ? l.lesson_rider : []) as any[]
    const activeRiders = lrs.filter((lr: any) => !lr.cancelled_at && !lr.deleted_at)

    return {
      lessonId:        l.id,
      scheduledAt:     l.scheduled_at,
      lessonType:      l.lesson_type as InstructorLesson['lessonType'],
      durationMinutes: l.duration_minutes ?? 30,
      isFuture:        new Date(l.scheduled_at) > now,
      riders: activeRiders.map((lr: any) => {
        const r    = Array.isArray(lr.rider)        ? lr.rider[0]        : lr.rider
        const h    = Array.isArray(lr.horse)        ? lr.horse[0]        : lr.horse
        const sub  = Array.isArray(lr.subscription) ? lr.subscription[0] : lr.subscription
        const guardian = r?.guardian_id ? guardianMap.get(r.guardian_id) : null

        return {
          lrId:             lr.id,
          name:             r?.preferred_name ?? r?.first_name ?? 'Rider',
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
    }
  })

  // Group lessons by weekday index (0 = Monday ... 6 = Sunday)
  const lessonsByDay: InstructorLesson[][] = [[], [], [], [], [], [], []]
  for (const l of lessons) {
    const d = new Date(l.scheduledAt)
    const jsDay = d.getDay() // 0 = Sunday
    const idx = jsDay === 0 ? 6 : jsDay - 1
    lessonsByDay[idx].push(l)
  }

  // ── All active horses (for the horse picker) ────────────────────────────
  const { data: allHorses } = await db
    .from('horse')
    .select('id, barn_name, lesson_horse')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  const horseOptions: HorseOption[] = [
    ...(allHorses ?? []).filter(h => h.lesson_horse).map(h => ({ id: h.id, barnName: h.barn_name, isLessonHorse: true })),
    ...(allHorses ?? []).filter(h => !h.lesson_horse).map(h => ({ id: h.id, barnName: h.barn_name, isLessonHorse: false })),
  ]

  // ── Horse workload bar ───────────────────────────────────────────────────
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00'
  const weekAgoStr = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()

  const [lessonHorsesRes, todayLessonsRes, weekLessonsRes] = await Promise.all([
    db.from('horse')
      .select('id, barn_name')
      .eq('lesson_horse', true)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('barn_name'),

    db.from('lesson')
      .select('id, lesson_rider!lesson_rider_lesson_id_fkey(horse_id, cancelled_at)')
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled_rider","cancelled_barn")')
      .gte('scheduled_at', todayStart)
      .lte('scheduled_at', now.toISOString().slice(0, 10) + 'T23:59:59'),

    db.from('lesson')
      .select('id, lesson_rider!lesson_rider_lesson_id_fkey(horse_id, cancelled_at)')
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled_rider","cancelled_barn")')
      .gte('scheduled_at', weekAgoStr)
      .lt('scheduled_at', todayStart),
  ])

  const lessonHorses = lessonHorsesRes.data ?? []

  const todayCountMap = new Map<string, number>()
  for (const lesson of todayLessonsRes.data ?? []) {
    const lrs = Array.isArray((lesson as any).lesson_rider) ? (lesson as any).lesson_rider : []
    for (const lr of lrs) {
      if (lr.horse_id && !lr.cancelled_at)
        todayCountMap.set(lr.horse_id, (todayCountMap.get(lr.horse_id) ?? 0) + 1)
    }
  }
  const weekCountMap = new Map<string, number>()
  for (const lesson of weekLessonsRes.data ?? []) {
    const lrs = Array.isArray((lesson as any).lesson_rider) ? (lesson as any).lesson_rider : []
    for (const lr of lrs) {
      if (lr.horse_id && !lr.cancelled_at)
        weekCountMap.set(lr.horse_id, (weekCountMap.get(lr.horse_id) ?? 0) + 1)
    }
  }

  const workload: HorseWorkload[] = lessonHorses.map(h => ({
    id:             h.id,
    barnName:       h.barn_name,
    todayCount:     todayCountMap.get(h.id) ?? 0,
    weekCount:      weekCountMap.get(h.id) ?? 0,
    schedulingNote: null,
  }))

  const todayParam = toDateParam(now)

  return (
    <>
      <div className="space-y-2 pb-16">
        <WeekPicker weekStart={weekStartParam} isCurrentWeek={isCurrentWeek} />

        {lessonsByDay.map((dayLessons, i) => {
          const date = new Date(weekMonday)
          date.setDate(date.getDate() + i)
          const isToday = toDateParam(date) === todayParam
          const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-baseline gap-2 px-1 pt-1">
                <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-secondary' : 'text-on-surface-muted'}`}>
                  {DAY_LABELS[i]}
                </span>
                <span className="text-xs text-on-surface-muted">{dateLabel}</span>
                {isToday && (
                  <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Today</span>
                )}
              </div>

              {dayLessons.length === 0 ? (
                <div className="bg-surface-lowest/40 rounded-lg px-4 py-2">
                  <p className="text-xs text-on-surface-muted italic">No lessons</p>
                </div>
              ) : (
                dayLessons.map(l => (
                  <InstructorLessonCard key={l.lessonId} lesson={l} horses={horseOptions} />
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
