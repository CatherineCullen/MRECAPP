import type { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

/**
 * Horse chronology loader — fetches lessons, training rides, and board
 * service logs for one horse, merges them into a single date-ordered
 * feed. Used by the HorseChronologySection on the admin horse page
 * (and, eventually, the boarder mobile horse view — keep this loader
 * framework-agnostic so it can be reused).
 *
 * Scope (decided 2026-04-19, Catherine):
 *   - Included: lessons (all current states), training rides, board
 *     service logs (all non-voided — billable or not).
 *   - Excluded: health events, vet visits, care plans, diet, status
 *     changes, camp/parties, documents.
 *
 * Cancellation rule: lessons in 'cancelled_rider' or 'cancelled_barn'
 * are kept in the feed for 72 hours past their scheduled_at, then
 * dropped. Avoids clutter from ancient cancellations while giving the
 * recent ones time to show up in the narrative.
 *
 * Load horizon: DEFAULT_MONTHS_BACK months back from today; all future
 * events (bounded by quarter-scheduled lessons, ~12 weeks out). If
 * render starts feeling slow, the two dials are (a) shorten the window
 * and (b) paginate (Load older button) instead of extending.
 *
 * Back-of-envelope for an active horse: weekly lesson × 52 + weekly
 * training ride × 52 + ~4 services/month × 12 ≈ 170 events/year. At
 * 170 rows the merge + render is instant. Estimated ceiling before UI
 * lag: ~2000 rows.
 */

const DEFAULT_MONTHS_BACK = 12
const CANCELLED_GRACE_HOURS = 72

export type ChronologyEvent = {
  id:         string
  kind:       'lesson' | 'training_ride' | 'service'
  // ISO timestamp used for sort + Today-anchor comparison. Always
  // populated; for date-only sources (training_ride.ride_date) we use
  // midday so it sorts after any morning lesson on the same day but
  // before afternoon ones without being deceptively precise.
  at:         string
  // YYYY-MM-DD used for day grouping in the client component.
  dateKey:    string
  hasTime:    boolean           // show clock time on the card?
  title:      string             // e.g. "Lesson with Amaris" / "Training ride — Kaley"
  subtitle:   string | null      // secondary detail, e.g. "Private · Paul"
  status:     string             // human label — 'Scheduled', 'Completed', 'Cancelled', 'Logged'
  tone:       'default' | 'muted' | 'info' | 'success' | 'warn'
}

export async function loadHorseChronology(
  supabase:  ReturnType<typeof createAdminClient>,
  horseId:   string,
  monthsBack: number = DEFAULT_MONTHS_BACK,
): Promise<ChronologyEvent[]> {
  const now          = new Date()
  const cutoff       = new Date(now); cutoff.setMonth(cutoff.getMonth() - monthsBack)
  const cutoffIso    = cutoff.toISOString()
  const cutoffDate   = cutoffIso.slice(0, 10)
  const cancelFloor  = new Date(now.getTime() - CANCELLED_GRACE_HOURS * 3600_000).toISOString()

  // Three parallel queries — one per source table. PostgREST's inner
  // join (`!inner`) on nested selects lets us filter by nested columns
  // in a single round-trip per source.
  const [lessonRes, rideRes, serviceRes] = await Promise.all([
    supabase
      .from('lesson_rider')
      .select(`
        id, horse_id,
        rider:rider_id ( first_name, last_name, preferred_name, is_organization, organization_name ),
        lesson:lesson_id!inner (
          id, scheduled_at, status, lesson_type, deleted_at,
          instructor:instructor_id ( first_name, last_name, preferred_name, is_organization, organization_name )
        )
      `)
      .eq('horse_id', horseId)
      .is('deleted_at', null)
      .is('lesson.deleted_at', null)
      .gte('lesson.scheduled_at', cutoffIso),

    supabase
      .from('training_ride')
      .select(`
        id, ride_date, status, logged_at, notes,
        provider:rider_id ( first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .eq('horse_id', horseId)
      .is('deleted_at', null)
      .gte('ride_date', cutoffDate),

    supabase
      .from('board_service_log')
      .select(`
        id, logged_at, status, unit_price, is_billable, notes, logged_by_label,
        service:service_id ( name ),
        logged_by:logged_by_id ( first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .eq('horse_id', horseId)
      .neq('status', 'voided')
      .gte('logged_at', cutoffIso),
  ])

  const events: ChronologyEvent[] = []

  // ── Lessons ────────────────────────────────────────────────────
  for (const row of (lessonRes.data ?? []) as any[]) {
    const l = row.lesson
    if (!l) continue

    const isCancelled = l.status === 'cancelled_rider' || l.status === 'cancelled_barn'
    // 72-hour grace for cancelled lessons — drop once ancient.
    if (isCancelled && l.scheduled_at < cancelFloor) continue

    const riderName      = displayName(row.rider)
    const instructorName = displayName(l.instructor)
    const typeLabel      = l.lesson_type === 'private'      ? 'Private'
                         : l.lesson_type === 'semi_private' ? 'Semi-private'
                         : l.lesson_type === 'group'        ? 'Group'
                         : l.lesson_type
    const statusLabel    = l.status === 'completed'        ? 'Completed'
                         : l.status === 'cancelled_rider'  ? 'Cancelled'
                         : l.status === 'cancelled_barn'   ? 'Cancelled (barn)'
                         : l.status === 'no_show'          ? 'No show'
                         : 'Scheduled'
    const tone: ChronologyEvent['tone'] =
        l.status === 'completed'       ? 'success'
      : isCancelled                    ? 'muted'
      : l.status === 'no_show'         ? 'warn'
      :                                  'info'

    events.push({
      id:       `lesson:${l.id}:${row.id}`,
      kind:     'lesson',
      at:       l.scheduled_at,
      dateKey:  l.scheduled_at.slice(0, 10),
      hasTime:  true,
      title:    `Lesson with ${riderName}`,
      subtitle: `${typeLabel} · ${instructorName}`,
      status:   statusLabel,
      tone,
    })
  }

  // ── Training rides ─────────────────────────────────────────────
  for (const r of (rideRes.data ?? []) as any[]) {
    const provider = displayName(r.provider)
    // ride_date is date-only; anchor to midday so within-day sorting
    // lands somewhere reasonable next to timestamped events.
    const atIso    = `${r.ride_date}T12:00:00.000Z`
    const isLogged = r.status === 'logged'

    events.push({
      id:       `ride:${r.id}`,
      kind:     'training_ride',
      at:       atIso,
      dateKey:  r.ride_date,
      hasTime:  false,
      title:    `Training ride — ${provider}`,
      // Surface the provider's notes — this is where the signal lives for
      // owners/staff scanning chronology ("tight through back right,"
      // "off on left lead," etc.). Board service logs already use the
      // subtitle for their notes, so this is consistent.
      subtitle: r.notes || null,
      status:   isLogged ? 'Logged' : 'Scheduled',
      tone:     isLogged ? 'success' : 'info',
    })
  }

  // ── Board service logs ─────────────────────────────────────────
  for (const s of (serviceRes.data ?? []) as any[]) {
    const serviceName = s.service?.name ?? 'Service'
    const loggedBy    = s.logged_by ? displayName(s.logged_by) : (s.logged_by_label ?? null)
    const subtitle    = [loggedBy, s.notes].filter(Boolean).join(' · ') || null
    // unit_price is snapshotted at log-time. Show dollars on billable
    // services as a gentle indicator; non-billable services show the
    // activity without a price tag.
    const statusLabel =
        s.status === 'logged'          ? 'Logged'
      : s.status === 'pending_review'  ? 'Pending review'
      : s.status === 'reviewed'        ? 'Reviewed'
      : s.status === 'invoiced'        ? 'Invoiced'
      :                                  s.status

    events.push({
      id:       `service:${s.id}`,
      kind:     'service',
      at:       s.logged_at,
      dateKey:  s.logged_at.slice(0, 10),
      hasTime:  false,  // services hide clock time per spec
      title:    serviceName,
      subtitle,
      status:   statusLabel,
      tone:     'default',
    })
  }

  // Sort descending by timestamp — future at top, past at bottom. The
  // client Today-marker sits between them; a useEffect scrolls it into
  // view on mount.
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  return events
}
