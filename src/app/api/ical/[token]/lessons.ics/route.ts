import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { renderIcal, type IcalEvent } from '@/lib/ical'
import { getRiderScope } from '@/app/my/_lib/riderScope'

export const dynamic = 'force-dynamic'

/**
 * Read-only iCal feed for a rider. Token is the credential — it's per-person,
 * unguessable, rotatable. Path is `.ics`-suffixed so Google/Apple correctly
 * identify the content type from the URL alone.
 *
 * Window: past 30 days + all future scheduled items. Calendar apps that cache
 * older events keep their local copy; we just stop serving them.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token) return new NextResponse('Not found', { status: 404 })

  const db = createAdminClient()

  const { data: person } = await db
    .from('person')
    .select('id, first_name, preferred_name')
    .eq('ical_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!person) return new NextResponse('Not found', { status: 404 })

  const riderIds = await getRiderScope(person.id)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffIso = cutoff.toISOString()
  const cutoffDate = cutoffIso.slice(0, 10)

  // Lessons via lesson_rider
  const { data: lessonRiders } = await db
    .from('lesson_rider')
    .select(`
      id,
      rider:person!rider_id (first_name, preferred_name),
      lesson:lesson!lesson_id (
        id, scheduled_at, lesson_type, status, deleted_at, duration_minutes, instructor_id
      )
    `)
    .in('rider_id', riderIds)
    .is('cancelled_at', null)
    .is('deleted_at', null)

  type Row = NonNullable<typeof lessonRiders>[number]
  const liveLessons = (lessonRiders ?? []).filter((lr: Row) => {
    const l = Array.isArray(lr.lesson) ? lr.lesson[0] : (lr.lesson as any)
    if (!l || l.deleted_at) return false
    if (l.status !== 'scheduled') return false
    return l.scheduled_at >= cutoffIso
  })

  // Instructor names
  const instructorIds = Array.from(new Set(
    liveLessons.map((lr: Row) => {
      const l = Array.isArray(lr.lesson) ? lr.lesson[0] : (lr.lesson as any)
      return l?.instructor_id as string | undefined
    }).filter(Boolean) as string[],
  ))
  const { data: instructors } = instructorIds.length > 0
    ? await db.from('person').select('id, first_name, preferred_name').in('id', instructorIds)
    : { data: [] }
  const instructorName = new Map(
    (instructors ?? []).map(p => [p.id, p.preferred_name ?? p.first_name ?? 'Instructor']),
  )

  // Training rides — rider's horses (horse_contact via riderScope), scheduled only
  const { data: horseLinks } = await db
    .from('horse_contact')
    .select('horse_id')
    .in('person_id', riderIds)
    .is('deleted_at', null)
  const myHorseIds = (horseLinks ?? []).map(h => h.horse_id)

  const { data: rides } = myHorseIds.length > 0
    ? await db
        .from('training_ride')
        .select(`
          id, ride_date, notes,
          horse:horse!horse_id (barn_name),
          provider:person!rider_id (first_name, preferred_name, is_organization, organization_name)
        `)
        .in('horse_id', myHorseIds)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('ride_date', cutoffDate)
    : { data: [] }

  const events: IcalEvent[] = []

  for (const lr of liveLessons) {
    const l = Array.isArray(lr.lesson) ? lr.lesson[0] : (lr.lesson as any)
    const rider = Array.isArray((lr as any).rider) ? (lr as any).rider[0] : (lr as any).rider
    const riderName = rider?.preferred_name ?? rider?.first_name ?? null
    const instr = instructorName.get(l.instructor_id) ?? 'Instructor'
    const start = new Date(l.scheduled_at)
    const end = new Date(start.getTime() + (l.duration_minutes ?? 30) * 60_000)
    const typeLabel =
      l.lesson_type === 'private' ? 'Private lesson'
      : l.lesson_type === 'semi_private' ? 'Semi-private lesson'
      : 'Group lesson'
    events.push({
      uid:         `mrec-lesson-${l.id}@marlbororidgeequestriancenter.com`,
      start,
      end,
      summary:     riderName ? `${typeLabel} — ${riderName}` : typeLabel,
      description: `Instructor: ${instr}\n\nTo cancel or reschedule, open the Marlboro Ridge Equestrian Center app.`,
      location:    'Marlboro Ridge Equestrian Center',
    })
  }

  for (const r of rides ?? []) {
    const horse = Array.isArray((r as any).horse) ? (r as any).horse[0] : (r as any).horse
    const provider = Array.isArray((r as any).provider) ? (r as any).provider[0] : (r as any).provider
    const providerName = provider?.is_organization
      ? (provider.organization_name ?? 'Training provider')
      : [provider?.preferred_name ?? provider?.first_name, provider?.last_name].filter(Boolean).join(' ') || 'Training provider'
    const start = new Date(`${r.ride_date}T12:00:00-04:00`)
    const end = new Date(start.getTime() + 60 * 60_000)
    events.push({
      uid:         `mrec-ride-${r.id}@marlbororidgeequestriancenter.com`,
      start,
      end,
      summary:     `Training ride — ${horse?.barn_name ?? 'Horse'}`,
      description: `Provider: ${providerName}${r.notes ? `\n\nNotes: ${r.notes}` : ''}\n\nTo reschedule, open the Marlboro Ridge Equestrian Center app.`,
      location:    'Marlboro Ridge Equestrian Center',
    })
  }

  const calendarName = `Marlboro Ridge — ${person.preferred_name ?? person.first_name ?? 'Schedule'}`
  const body = renderIcal(events, calendarName)

  return new NextResponse(body, {
    headers: {
      'Content-Type':  'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
    },
  })
}
