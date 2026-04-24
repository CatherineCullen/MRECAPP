import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LessonCard from './_components/LessonCard'
import TrainingRideCard from './_components/TrainingRideCard'
import MakeupTokenCard from './_components/MakeupTokenCard'
import { getRiderScope } from '../_lib/riderScope'

export const metadata = { title: 'My Schedule — Marlboro Ridge Equestrian Center' }

export default async function MySchedulePage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db      = createAdminClient()
  const now     = new Date()
  const nowStr  = now.toISOString()
  const todayDate = nowStr.slice(0, 10)

  const riderIds = await getRiderScope(user.personId)

  // Upcoming lessons via lesson_rider
  const { data: lessonRiders } = await db
    .from('lesson_rider')
    .select(`
      id,
      subscription_id,
      rider:person!rider_id (first_name, preferred_name),
      lesson:lesson!lesson_id (
        id, scheduled_at, lesson_type, is_makeup, status, deleted_at, instructor_id
      ),
      subscription:lesson_subscription!subscription_id (
        subscription_type
      )
    `)
    .in('rider_id', riderIds)
    .is('cancelled_at', null)
    .is('deleted_at', null)

  // Filter to upcoming scheduled lessons in JS (PostgREST nested filters are unreliable here)
  type LessonRiderRow = NonNullable<typeof lessonRiders>[number]
  const upcoming = (lessonRiders ?? []).filter((lr: LessonRiderRow) => {
    const lesson = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
    if (!lesson) return false
    if (lesson.deleted_at) return false
    if (lesson.status !== 'scheduled') return false
    return lesson.scheduled_at >= nowStr
  }).sort((a: LessonRiderRow, b: LessonRiderRow) => {
    const la = Array.isArray(a.lesson) ? a.lesson[0] : a.lesson as any
    const lb = Array.isArray(b.lesson) ? b.lesson[0] : b.lesson as any
    return la.scheduled_at.localeCompare(lb.scheduled_at)
  })

  // Collect instructor IDs for name lookup
  const instructorIds = Array.from(new Set(
    upcoming.map((lr: LessonRiderRow) => {
      const l = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
      return l?.instructor_id as string | undefined
    }).filter(Boolean) as string[]
  ))

  const { data: instructors } = instructorIds.length > 0
    ? await db.from('person').select('id, first_name, preferred_name').in('id', instructorIds)
    : { data: [] }

  const instructorMap = new Map((instructors ?? []).map(p => [
    p.id,
    p.preferred_name ?? p.first_name,
  ]))

  // Upcoming training rides — show rides on horses this person is connected to
  // (owner, lessor, etc.). Note: training_ride.rider_id is actually the
  // *provider*; horse_id is what links a ride to the boarder's view.
  const { data: horseConnections } = await db
    .from('horse_contact')
    .select('horse_id')
    .in('person_id', riderIds)
    .is('deleted_at', null)

  const myHorseIds = (horseConnections ?? []).map(c => c.horse_id)

  const { data: trainingRides } = myHorseIds.length > 0
    ? await db
        .from('training_ride')
        .select('id, ride_date, horse:horse!horse_id(barn_name), provider:person!rider_id(first_name, preferred_name)')
        .in('horse_id', myHorseIds)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('ride_date', todayDate)
        .order('ride_date', { ascending: true })
    : { data: [] }

  // Available makeup tokens
  const { data: makeupTokens } = await db
    .from('makeup_token')
    .select('id')
    .in('rider_id', riderIds)
    .eq('status', 'available')
    .is('scheduled_lesson_id', null)

  const makeupCount = makeupTokens?.length ?? 0

  // Build merged chronological list
  type Item =
    | { kind: 'lesson';   date: string; lr: LessonRiderRow }
    | { kind: 'training'; date: string; ride: NonNullable<typeof trainingRides>[number] }

  const items: Item[] = [
    ...upcoming.map((lr: LessonRiderRow): Item => {
      const l = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
      return { kind: 'lesson', date: l.scheduled_at, lr }
    }),
    ...(trainingRides ?? []).map((ride): Item => ({
      kind: 'training',
      date: ride.ride_date + 'T00:00:00',
      ride,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="space-y-3">
      {/* Makeup token banners */}
      <MakeupTokenCard count={makeupCount} />

      {/* Schedule list */}
      {items.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm font-semibold text-on-surface">No upcoming lessons</p>
          <p className="text-xs text-on-surface-muted mt-1">Contact the barn if you think this is incorrect.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            if (item.kind === 'lesson') {
              const l    = Array.isArray(item.lr.lesson) ? item.lr.lesson[0] : item.lr.lesson as any
              const sub  = Array.isArray(item.lr.subscription) ? item.lr.subscription[0] : item.lr.subscription as any
              const rider = Array.isArray((item.lr as any).rider) ? (item.lr as any).rider[0] : (item.lr as any).rider as any
              const riderName = rider?.preferred_name ?? rider?.first_name ?? null
              const hoursUntil = (new Date(l.scheduled_at).getTime() - now.getTime()) / (1000 * 60 * 60)
              return (
                <LessonCard
                  key={item.lr.id}
                  lessonRiderId={item.lr.id}
                  scheduledAt={l.scheduled_at}
                  instructorName={instructorMap.get(l.instructor_id) ?? 'Instructor'}
                  lessonType={l.lesson_type}
                  isMakeup={l.is_makeup}
                  hoursUntil={hoursUntil}
                  riderName={riderName}
                />
              )
            } else {
              const horse    = Array.isArray(item.ride.horse)    ? item.ride.horse[0]    : item.ride.horse    as any
              const provider = Array.isArray((item.ride as any).provider) ? (item.ride as any).provider[0] : (item.ride as any).provider as any
              const providerName = provider?.preferred_name ?? provider?.first_name ?? null
              return (
                <TrainingRideCard
                  key={item.ride.id}
                  rideDate={item.ride.ride_date}
                  horseName={horse?.barn_name ?? 'Horse'}
                  providerName={providerName}
                />
              )
            }
          })}
        </div>
      )}

      {/* Footer links */}
      <div className="pt-2 space-y-2">
        <p className="text-xs text-on-surface-muted">
          Questions about your schedule?{' '}
          <a href="mailto:marlbororidgeequestriancenter@gmail.com" className="text-on-secondary-container font-semibold">
            Contact the barn
          </a>
        </p>
      </div>
    </div>
  )
}
