import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { renderIcal, type IcalEvent } from '@/lib/ical'
import { getRiderScope } from '@/app/my/_lib/riderScope'

export const dynamic = 'force-dynamic'

/**
 * Add minutes to a naive wall-clock string ("YYYY-MM-DDTHH:MM:SS") without
 * going through a timezone-aware Date. Uses `Date.UTC` purely for arithmetic
 * rollover (e.g. "23:45" + 30min = next day 00:15) — the resulting instant is
 * discarded; we only read back the wall-clock components via UTC getters.
 */
function addMinutesToNaive(naive: string, minutes: number): string {
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return naive
  const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + minutes, +(m[6] ?? '0')))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`
}

/** Add whole days to a "YYYY-MM-DD" string. Same UTC-arithmetic trick. */
function addDaysToDate(date: string, days: number): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return date
  const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`
}

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
    const typeLabel =
      l.lesson_type === 'private' ? 'Private lesson'
      : l.lesson_type === 'semi_private' ? 'Semi-private lesson'
      : 'Group lesson'

    // `scheduled_at` is a naive timestamp — no offset — meaning Eastern wall
    // clock. Do NOT parse it with `new Date()` on the server because:
    //   - on Vercel (UTC) it'd be interpreted as UTC, emitting 4pm lessons as
    //     4pm UTC (= noon Eastern in Google Cal — the bug we're fixing).
    //   - on a dev Mac (Eastern) it'd be interpreted as Eastern, working by
    //     coincidence in dev but silently breaking in prod.
    // Instead: read the wall-clock components from the string and emit as
    // TZID=America/New_York local time. Calendar clients resolve the offset
    // via the VTIMEZONE block, so DST is handled correctly year-round.
    const startLocal = l.scheduled_at.slice(0, 19)      // "YYYY-MM-DDTHH:MM:SS"
    const endLocal = addMinutesToNaive(startLocal, l.duration_minutes ?? 30)
    events.push({
      uid:         `mrec-lesson-${l.id}@marlbororidgeequestriancenter.com`,
      kind:        'local',
      tzid:        'America/New_York',
      startLocal,
      endLocal,
      summary:     riderName ? `${typeLabel} — ${riderName}` : typeLabel,
      description: `Instructor: ${instr}\n\nTo cancel or reschedule, log in to https://www.mrecapp.com.`,
      location:    'Marlboro Ridge Equestrian Center',
    })
  }

  for (const r of rides ?? []) {
    const horse = Array.isArray((r as any).horse) ? (r as any).horse[0] : (r as any).horse
    const provider = Array.isArray((r as any).provider) ? (r as any).provider[0] : (r as any).provider
    const providerName = provider?.is_organization
      ? (provider.organization_name ?? 'Training provider')
      : [provider?.preferred_name ?? provider?.first_name, provider?.last_name].filter(Boolean).join(' ') || 'Training provider'
    // All-day event — training rides are loosely scheduled within the day,
    // and a noon timed event reads as "noon appointment" on a rider's calendar.
    // DTEND is exclusive per RFC 5545, so a single-day event ends the next day.
    events.push({
      uid:         `mrec-ride-${r.id}@marlbororidgeequestriancenter.com`,
      kind:        'allDay',
      startDate:   r.ride_date,
      endDate:     addDaysToDate(r.ride_date, 1),
      summary:     `Training ride — ${horse?.barn_name ?? 'Horse'}`,
      description: `Provider: ${providerName}${r.notes ? `\n\nNotes: ${r.notes}` : ''}\n\nTo reschedule, log in to https://www.mrecapp.com.`,
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
