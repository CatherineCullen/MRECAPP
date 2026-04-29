// All barn timestamps follow the standard pattern: stored UTC (timestamptz),
// displayed Eastern. Conversions go through date-fns-tz so there's one
// trustworthy implementation we don't maintain.

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

export const BARN_TZ = 'America/New_York'

/**
 * Convert a barn-local wall-clock date+time (from <input type=date> +
 * <input type=time>) to a UTC ISO string for storage. The browser's own
 * timezone is irrelevant — we always interpret the input as Eastern.
 */
export function barnLocalToUtcIso(date: string, time: string): string {
  // date-fns-tz takes "YYYY-MM-DDTHH:mm:ss" plus a TZ and returns the
  // UTC instant. fromZonedTime is the inverse of formatInTimeZone.
  const naive = `${date}T${time.length === 5 ? time + ':00' : time}`
  return fromZonedTime(naive, BARN_TZ).toISOString()
}

/** Format a UTC ISO timestamp as a barn-local date+time. */
export function formatBarnDateTime(iso: string | Date): string {
  return formatInTimeZone(iso, BARN_TZ, 'EEE, MMM d, yyyy, h:mm a')
}

/** Format a UTC ISO timestamp as a barn-local date (no time). */
export function formatBarnDate(iso: string | Date): string {
  return formatInTimeZone(iso, BARN_TZ, 'MMM d, yyyy')
}

/** Format a UTC ISO timestamp as a barn-local clock time (no date). */
export function formatBarnTime(iso: string | Date): string {
  return formatInTimeZone(iso, BARN_TZ, 'h:mm a')
}

/**
 * Convert a UTC ISO timestamp to a naive barn-local wall-clock string
 * "YYYY-MM-DDTHH:MM:SS". Used by iCal (which emits the wall-clock plus a
 * TZID=America/New_York reference).
 */
export function utcIsoToBarnNaive(iso: string | Date): string {
  return formatInTimeZone(iso, BARN_TZ, "yyyy-MM-dd'T'HH:mm:ss")
}

/** Today's date in the barn timezone, as YYYY-MM-DD. */
export function barnToday(): string {
  return formatInTimeZone(new Date(), BARN_TZ, 'yyyy-MM-dd')
}
