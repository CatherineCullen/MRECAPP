import 'server-only'
import { randomUUID } from 'crypto'

/**
 * RFC 5545 iCalendar helpers for the rider calendar feed.
 *
 * Feed is read-only, one-way pull. Calendar apps (Google, Apple, Outlook)
 * fetch on their own schedule — Google ~24hr, Apple ~1hr. The feed URL is
 * tokenized per rider (`person.ical_token`), so knowing someone's person id
 * doesn't leak their schedule.
 */

const PRODID = '-//Marlboro Ridge Equestrian Center//CHIA//EN'

export function generateIcalToken(): string {
  return randomUUID()
}

/** Format a Date as a UTC iCal timestamp: YYYYMMDDTHHMMSSZ */
function formatUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escape text per RFC 5545 §3.3.11 (backslash, comma, semicolon, newline). */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/** Fold lines to 75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    const chunkLen = i === 0 ? 75 : 74
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + chunkLen))
    i += chunkLen
  }
  return parts.join('\r\n')
}

/**
 * Two event kinds:
 *
 * - `allDay` — date-only (RFC 5545 DATE value). `startDate` / `endDate` are
 *   `YYYY-MM-DD` strings. `endDate` is exclusive — for a single day, pass
 *   start+1. Used for training rides.
 *
 * - `local` — timed event in a specific IANA timezone. `startLocal` /
 *   `endLocal` are naive wall-clock strings `YYYY-MM-DDTHH:MM:SS` in `tzid`.
 *   Emitted as `DTSTART;TZID=...` alongside a matching `VTIMEZONE` block so
 *   calendar clients render them in the barn's timezone regardless of where
 *   the server or the reader is. This avoids the UTC-server / Eastern-barn
 *   skew that bit us before.
 *
 * We deliberately do NOT support UTC-timestamp events (`DTSTART:...Z`) because
 *   constructing a correct UTC instant from our naive `scheduled_at` column is
 *   exactly the bug we're avoiding. If a future use-case needs UTC, add it
 *   explicitly.
 */
export type IcalEvent = {
  /** Stable unique id — "<domain>-<kind>-<row-id>" works. */
  uid:         string
  summary:     string
  description: string
  location?:   string
} & (
  | {
      kind:      'allDay'
      /** `YYYY-MM-DD` */
      startDate: string
      /** `YYYY-MM-DD`, exclusive */
      endDate:   string
    }
  | {
      kind:       'local'
      tzid:       string
      /** `YYYY-MM-DDTHH:MM:SS` wall-clock in `tzid` */
      startLocal: string
      /** `YYYY-MM-DDTHH:MM:SS` wall-clock in `tzid` */
      endLocal:   string
    }
)

/** Format wall-clock "YYYY-MM-DDTHH:MM:SS" → "YYYYMMDDTHHMMSS". */
function formatLocalIcal(local: string): string {
  return local.slice(0, 19).replace(/[-:]/g, '')
}

/** Format "YYYY-MM-DD" → "YYYYMMDD". */
function formatDateIcal(date: string): string {
  return date.slice(0, 10).replace(/-/g, '')
}

/**
 * VTIMEZONE block for America/New_York. Defines the recurring DST rules so any
 * client can resolve wall-clock times to absolute instants without needing its
 * own tzdata lookup. Rules reflect the US federal DST schedule in effect since
 * 2007: "spring forward" 2am on the 2nd Sunday of March, "fall back" 2am on
 * the 1st Sunday of November.
 */
const AMERICA_NEW_YORK_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'X-LIC-LOCATION:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

export function renderIcal(events: IcalEvent[], calendarName: string): string {
  const now = formatUtc(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:America/New_York',
    // Tell clients how often to refresh. Google ignores this, Apple respects.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  // VTIMEZONE must precede any VEVENT that references its TZID. We always
  // include America/New_York since that's the barn. If we ever span multiple
  // zones, emit one VTIMEZONE per distinct tzid used in the event set.
  lines.push(...AMERICA_NEW_YORK_VTIMEZONE)

  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${now}`,
    )
    if (ev.kind === 'allDay') {
      lines.push(
        `DTSTART;VALUE=DATE:${formatDateIcal(ev.startDate)}`,
        `DTEND;VALUE=DATE:${formatDateIcal(ev.endDate)}`,
      )
    } else {
      lines.push(
        `DTSTART;TZID=${ev.tzid}:${formatLocalIcal(ev.startLocal)}`,
        `DTEND;TZID=${ev.tzid}:${formatLocalIcal(ev.endLocal)}`,
      )
    }
    lines.push(
      `SUMMARY:${escapeText(ev.summary)}`,
      `DESCRIPTION:${escapeText(ev.description)}`,
    )
    if (ev.location) {
      lines.push(`LOCATION:${escapeText(ev.location)}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
