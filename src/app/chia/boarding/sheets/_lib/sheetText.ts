/**
 * Plain-text rendering of a sheet for the "Copy as text" button. Output is
 * meant to be pasted into SMS, email, or a group chat — no markdown, no
 * trailing whitespace, just readable lines.
 */
import { displayName } from '@/lib/displayName'

export type SheetTextSlot = {
  position:         number
  start_time:       string | null   // 'HH:MM:SS' or null
  duration_minutes: number | null
  horse_name:       string | null
  signed_up_by:     { first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization?: boolean | null; organization_name?: string | null } | null
  notes:            string | null
}

export type SheetTextSheet = {
  title:       string
  date:        string             // 'YYYY-MM-DD'
  mode:        'timed' | 'ordered'
  description: string | null
  slots:       SheetTextSlot[]
}

function fmtClock(t: string | null): string {
  if (!t) return ''
  // 'HH:MM:SS' → 'H:MM am/pm'
  const [hh, mm] = t.split(':').map(Number)
  const period   = hh >= 12 ? 'pm' : 'am'
  const h12      = ((hh + 11) % 12) + 1
  return `${h12}:${String(mm).padStart(2, '0')}${period}`
}

function fmtRange(start: string | null, durationMin: number | null): string {
  if (!start || !durationMin) return ''
  const [hh, mm] = start.split(':').map(Number)
  const total    = hh * 60 + mm + durationMin
  const endHH    = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const endMM    = String(total % 60).padStart(2, '0')
  return `${fmtClock(start)}–${fmtClock(`${endHH}:${endMM}:00`)}`
}

function fmtDate(d: string): string {
  // 'YYYY-MM-DD' → 'Mon, May 4'
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatSheetAsText(sheet: SheetTextSheet): string {
  const lines: string[] = []
  lines.push(`${sheet.title} — ${fmtDate(sheet.date)}`)
  if (sheet.description) {
    lines.push('')
    lines.push(sheet.description.trim())
  }
  lines.push('')

  for (const slot of sheet.slots) {
    const label =
      sheet.mode === 'timed'
        ? fmtRange(slot.start_time, slot.duration_minutes)
        : `${slot.position}.`

    const prefix = sheet.mode === 'timed'
      ? `${slot.position}. ${label} —`
      : `${label}`

    if (!slot.horse_name) {
      lines.push(`${prefix} open`)
      continue
    }

    const who = slot.signed_up_by ? displayName(slot.signed_up_by) : null
    const who_short = who ? ` (${who})` : ''
    const note = slot.notes ? ` — ${slot.notes.trim()}` : ''
    lines.push(`${prefix} ${slot.horse_name}${who_short}${note}`)
  }

  return lines.join('\n')
}
