// Pure helper to build the canonical line-item description for a
// LessonMonth invoice. Per ADR-0019:
//
//   "Wednesday 4pm with Paul Turner — 4 lessons (4/5, 4/12, 4/19, 4/26) · $90 each · $360 total"
//
// Used by the batch-send flow (sending one NMI invoice per billed-to
// person, with one line item per LessonMonth that person owes for the
// target month). Same description is used in the CSV export's
// `description_for_paste` column when that adapter lands (PR 9).

const DAY_LABEL: Record<string, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
}

/** "16:00:00" -> "4pm" / "16:30:00" -> "4:30pm" */
function formatTime(time: string): string {
  const [h, mm] = time.split(':')
  const hour = Number.parseInt(h, 10)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return mm === '00' ? `${h12}${ampm}` : `${h12}:${mm}${ampm}`
}

/** ISO 'YYYY-MM-DD' -> 'M/D' (no leading zeros) */
function shortDate(iso: string): string {
  const [, mo, da] = iso.split('-')
  return `${Number.parseInt(mo, 10)}/${Number.parseInt(da, 10)}`
}

export type LineItemDescriptionArgs = {
  dayOfWeek:      string  // 'monday', 'tuesday', etc
  lessonTime:     string  // 'HH:MM' or 'HH:MM:SS'
  instructorName: string
  dates:          string[]  // ISO YYYY-MM-DD
  perLessonPrice: number
}

/**
 * Build the line-item description string. Format matches ADR-0019's
 * canonical form. Caller passes in the raw inputs; this is a pure
 * helper so it's easy to test.
 */
export function lineItemDescription(args: LineItemDescriptionArgs): string {
  const { dayOfWeek, lessonTime, instructorName, dates, perLessonPrice } = args
  const day      = DAY_LABEL[dayOfWeek] ?? dayOfWeek
  const time     = formatTime(lessonTime)
  const dateList = dates.map(shortDate).join(', ')
  const total    = perLessonPrice * dates.length
  const each     = perLessonPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const totalFmt = total.toLocaleString('en-US',         { style: 'currency', currency: 'USD' })
  const lessonsLabel = dates.length === 1 ? '1 lesson' : `${dates.length} lessons`
  return `${day} ${time} with ${instructorName} — ${lessonsLabel} (${dateList}) · ${each} each · ${totalFmt} total`
}
