// All barn-facing dates/times are Eastern. Storage is honest UTC; display
// and form input are converted at the boundary.

export const BARN_TZ = 'America/New_York'

/**
 * Convert a wall-clock barn-local date+time to a UTC ISO string suitable
 * for storage in a `timestamptz` column. Inputs come from <input type=date>
 * and <input type=time>, which produce naked local strings.
 *
 * Example: barnLocalToUtcIso('2026-04-29', '21:30') → '2026-04-30T01:30:00.000Z'
 *          (during EDT — UTC-4)
 */
export function barnLocalToUtcIso(date: string, time: string): string {
  // Build a Date that *represents* the barn-local instant. We can't rely
  // on `new Date('2026-04-29T21:30:00')` to use barn-local — it uses the
  // server's TZ. So we compute the UTC timestamp by asking what the same
  // wall-clock would be in the barn TZ, and offsetting accordingly.
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)

  // Start by treating it as UTC, then correct by the offset between UTC
  // and barn TZ at that instant.
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0)
  const offsetMin = barnTzOffsetMinutes(new Date(utcGuess))
  return new Date(utcGuess - offsetMin * 60_000).toISOString()
}

/**
 * Returns the offset in minutes from UTC for the barn timezone at the
 * given instant. Positive for east of UTC, negative for west. Eastern
 * Time is -240 (EDT) or -300 (EST).
 */
export function barnTzOffsetMinutes(at: Date): number {
  // Use Intl to format the instant as parts in the barn TZ, then compute
  // the difference between that wall-clock and the UTC wall-clock.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BARN_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(dtf.formatToParts(at).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return (asUtc - at.getTime()) / 60_000
}

/** Format an ISO timestamp as a barn-local date+time. */
export function formatBarnDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('en-US', {
    timeZone: BARN_TZ,
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/** Format an ISO timestamp as a barn-local date (no time). */
export function formatBarnDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-US', {
    timeZone: BARN_TZ,
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/** Format an ISO timestamp as a barn-local clock time (no date). */
export function formatBarnTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('en-US', {
    timeZone: BARN_TZ,
    hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Convert a UTC ISO timestamp to a naive barn-local wall-clock string
 * "YYYY-MM-DDTHH:MM:SS" — no offset suffix. Used by iCal (which emits
 * the wall-clock plus a TZID=America/New_York reference).
 */
export function utcIsoToBarnNaive(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BARN_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(dtf.formatToParts(d).map(p => [p.type, p.value]))
  const hh = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}`
}

/** Today's date in the barn timezone, as YYYY-MM-DD. */
export function barnToday(): string {
  const now = new Date()
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BARN_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return dtf.format(now) // en-CA gives YYYY-MM-DD
}
