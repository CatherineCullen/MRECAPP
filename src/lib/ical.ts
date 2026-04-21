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

export type IcalEvent = {
  /** Stable unique id — "<domain>-<kind>-<row-id>" works. */
  uid:         string
  start:       Date
  end:         Date
  summary:     string
  description: string
  location?:   string
}

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

  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatUtc(ev.start)}`,
      `DTEND:${formatUtc(ev.end)}`,
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
