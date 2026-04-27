import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

// Mirror of the rider-facing "My Schedule" list, scoped to this one person and
// rendered inside the CHIA admin profile page. Read-only — staff click through
// to the canonical detail pages to take action. Includes:
//   - Upcoming lessons where this person is a rider
//   - Upcoming training rides on horses they're connected to
//   - Live sign-up sheet slots claimed for those horses
// Makeup tokens are intentionally excluded — they have their own dedicated
// admin view at /chia/lessons-events/tokens.

type Props = { personId: string }

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDate(iso: string): string {
  // Date-only — avoid TZ drift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  }
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default async function PersonScheduleSection({ personId }: Props) {
  const db        = createAdminClient()
  const now       = new Date()
  const nowStr    = now.toISOString()
  const todayDate = nowStr.slice(0, 10)

  // Lessons where this person is the rider
  const { data: lessonRiders } = await db
    .from('lesson_rider')
    .select(`
      id,
      lesson:lesson!lesson_id (
        id, scheduled_at, lesson_type, is_makeup, status, deleted_at,
        instructor:person!lesson_instructor_id_fkey ( id, first_name, preferred_name ),
        cancellation_reason
      ),
      horse:horse ( id, barn_name )
    `)
    .eq('rider_id', personId)
    .is('cancelled_at', null)
    .is('deleted_at', null)

  type LessonRiderRow = NonNullable<typeof lessonRiders>[number]
  const upcomingLessons = (lessonRiders ?? []).filter((lr: LessonRiderRow) => {
    const lesson = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
    if (!lesson) return false
    if (lesson.deleted_at) return false
    if (lesson.status !== 'scheduled') return false
    return lesson.scheduled_at >= nowStr
  })

  // Horses this person is connected to
  const { data: horseConnections } = await db
    .from('horse_contact')
    .select('horse_id')
    .eq('person_id', personId)
    .is('deleted_at', null)

  const myHorseIds = (horseConnections ?? []).map(c => c.horse_id)

  // Training rides on those horses (rider_id on training_ride is the *provider*)
  const { data: trainingRides } = myHorseIds.length > 0
    ? await db
        .from('training_ride')
        .select('id, ride_date, horse:horse!horse_id ( id, barn_name ), provider:person!rider_id ( id, first_name, preferred_name )')
        .in('horse_id', myHorseIds)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('ride_date', todayDate)
    : { data: [] }

  // Sign-up slots claimed for those horses
  const { data: signUpSlots } = myHorseIds.length > 0
    ? await db
        .from('sign_up_sheet_slot')
        .select(`
          id, start_time, duration_minutes,
          horse:horse_id ( id, barn_name ),
          sheet:sheet_id (
            id, title, date, mode, deleted_at,
            provider:provider_person_id ( first_name, preferred_name, is_organization, organization_name ),
            service:service_id ( name )
          )
        `)
        .in('horse_id', myHorseIds)
    : { data: [] }

  type SignUpRow = NonNullable<typeof signUpSlots>[number]
  const liveSignUps = (signUpSlots ?? []).filter((row: SignUpRow) => {
    const sheet = Array.isArray((row as any).sheet) ? (row as any).sheet[0] : (row as any).sheet
    if (!sheet || sheet.deleted_at) return false
    return sheet.date >= todayDate
  })

  type Item =
    | { kind: 'lesson';   sortKey: string; lr: LessonRiderRow }
    | { kind: 'training'; sortKey: string; ride: NonNullable<typeof trainingRides>[number] }
    | { kind: 'signup';   sortKey: string; row: SignUpRow }

  const items: Item[] = [
    ...upcomingLessons.map((lr: LessonRiderRow): Item => {
      const l = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
      return { kind: 'lesson', sortKey: l.scheduled_at, lr }
    }),
    ...(trainingRides ?? []).map((ride): Item => ({
      kind: 'training',
      sortKey: ride.ride_date + 'T00:00:00',
      ride,
    })),
    ...liveSignUps.map((row: SignUpRow): Item => {
      const sheet = Array.isArray((row as any).sheet) ? (row as any).sheet[0] : (row as any).sheet
      const sortKey = (sheet.mode === 'timed' && row.start_time)
        ? `${sheet.date}T${row.start_time}`
        : `${sheet.date}T00:00:00`
      return { kind: 'signup', sortKey, row }
    }),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Upcoming Schedule
        </h2>
        <span className="text-[11px] text-[#444650]">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[#444650]">
          No upcoming lessons, training rides, or sign-up slots.
        </div>
      ) : (
        <ul className="divide-y divide-[#e8edf4]">
          {items.map(item => {
            if (item.kind === 'lesson') {
              const l       = Array.isArray(item.lr.lesson) ? item.lr.lesson[0] : item.lr.lesson as any
              const instr   = Array.isArray(l.instructor) ? l.instructor[0] : l.instructor as any
              const horse   = Array.isArray((item.lr as any).horse) ? (item.lr as any).horse[0] : (item.lr as any).horse as any
              const instrName = instr ? (instr.preferred_name ?? instr.first_name ?? 'Instructor') : 'Instructor'
              return (
                <li key={`l-${item.lr.id}`} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded">
                    {l.is_makeup ? 'Makeup' : 'Lesson'}
                  </span>
                  <span className="text-[#191c1e] tabular-nums">{fmtDateTime(l.scheduled_at)}</span>
                  <span className="text-[#444650] flex-1 truncate">
                    {instrName}
                    {horse?.barn_name && (
                      <>
                        <span className="text-[#c4c6d1] mx-1">·</span>
                        <Link href={`/chia/herd/horses/${horse.id}`} className="hover:text-[#002058] hover:underline">
                          {horse.barn_name}
                        </Link>
                      </>
                    )}
                  </span>
                  <Link
                    href={`/chia/lessons-events/${l.id}`}
                    className="text-xs text-[#056380] hover:text-[#002058] hover:underline whitespace-nowrap"
                  >
                    Open →
                  </Link>
                </li>
              )
            }
            if (item.kind === 'training') {
              const horse    = Array.isArray(item.ride.horse) ? item.ride.horse[0] : item.ride.horse as any
              const provider = Array.isArray((item.ride as any).provider) ? (item.ride as any).provider[0] : (item.ride as any).provider as any
              const providerName = provider?.preferred_name ?? provider?.first_name ?? 'Provider'
              return (
                <li key={`t-${item.ride.id}`} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#ffddb3] text-[#7c4b00] px-1.5 py-0.5 rounded">
                    Training
                  </span>
                  <span className="text-[#191c1e] tabular-nums">{fmtDate(item.ride.ride_date)}</span>
                  <span className="text-[#444650] flex-1 truncate">
                    {providerName}
                    {horse?.barn_name && (
                      <>
                        <span className="text-[#c4c6d1] mx-1">·</span>
                        <Link href={`/chia/herd/horses/${horse.id}`} className="hover:text-[#002058] hover:underline">
                          {horse.barn_name}
                        </Link>
                      </>
                    )}
                  </span>
                  <Link
                    href={`/chia/training-rides`}
                    className="text-xs text-[#056380] hover:text-[#002058] hover:underline whitespace-nowrap"
                  >
                    Open →
                  </Link>
                </li>
              )
            }
            const sheet    = Array.isArray((item.row as any).sheet) ? (item.row as any).sheet[0] : (item.row as any).sheet
            const horse    = Array.isArray((item.row as any).horse) ? (item.row as any).horse[0] : (item.row as any).horse
            const provider = Array.isArray(sheet.provider) ? sheet.provider[0] : sheet.provider
            const service  = Array.isArray(sheet.service)  ? sheet.service[0]  : sheet.service
            const when     = (sheet.mode === 'timed' && item.row.start_time)
              ? `${fmtDate(sheet.date)} · ${item.row.start_time.slice(0, 5)}`
              : fmtDate(sheet.date)
            return (
              <li key={`s-${item.row.id}`} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded">
                  Sign-up
                </span>
                <span className="text-[#191c1e] tabular-nums">{when}</span>
                <span className="text-[#444650] flex-1 truncate">
                  {service?.name ?? sheet.title}
                  {provider && (
                    <>
                      <span className="text-[#c4c6d1] mx-1">·</span>
                      {displayName(provider)}
                    </>
                  )}
                  {horse?.barn_name && (
                    <>
                      <span className="text-[#c4c6d1] mx-1">·</span>
                      <Link href={`/chia/herd/horses/${horse.id}`} className="hover:text-[#002058] hover:underline">
                        {horse.barn_name}
                      </Link>
                    </>
                  )}
                </span>
                <Link
                  href={`/chia/boarding/sheets/${sheet.id}`}
                  className="text-xs text-[#056380] hover:text-[#002058] hover:underline whitespace-nowrap"
                >
                  Open →
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
