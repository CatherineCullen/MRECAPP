// Pure date helpers for the monthly lesson model (ADR-0019).
//
// No DB access, no 'server-only' — these are usable from preview UI
// (e.g. "your first month will be Apr 5, 12, 19, 26") as well as from
// server-side generation logic.
//
// Differences from the legacy `generateLessonDates` helper used by the
// quarterly model:
//   - Scoped to a single calendar month, not a quarter range.
//   - Does NOT filter on `is_makeup_day` — the makeup-window concept goes
//     away with quarters (ADR-0019). Every non-closed slot date in the
//     month generates a lesson; the 12-lesson cap is also gone (monthly
//     count is whatever the calendar gives, max 5).
//   - Optional `fromDate` argument supports prorated mid-month signups:
//     pass today's date to count only remaining slot dates.

export const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const
export type DayOfWeek = typeof DAYS[number]

export type CalendarDay = {
  date:        string   // ISO 'YYYY-MM-DD'
  barn_closed: boolean
}

export type SlotDatesArgs = {
  dayOfWeek:    DayOfWeek
  /** 4-digit year, e.g. 2026 */
  year:         number
  /** 1-12 */
  month:        number
  calendarDays: CalendarDay[]
  /**
   * Optional. ISO 'YYYY-MM-DD'. When set, only return dates >= this.
   * Use today's date for prorated mid-month signups.
   */
  fromDate?:    string
}

/**
 * Returns every ISO date in the given calendar month that:
 *   - falls on the target day of week
 *   - is NOT marked barn_closed in the calendar
 *   - is >= fromDate, if supplied
 *
 * Calendar days outside the target month are ignored. Days missing from
 * the calendar table are also skipped (matches the existing
 * `generateLessonDates` posture — calendar table is the source of truth).
 *
 * Sorted ascending. Typical month yields 4-5 dates; the calendar dictates,
 * not a hardcoded cap.
 */
export function slotDatesInMonth(args: SlotDatesArgs): string[] {
  const { dayOfWeek, year, month, calendarDays } = args
  const dayIdx = DAYS.indexOf(dayOfWeek)
  if (dayIdx < 0) return []

  const monthStart = monthStartIso(year, month)
  const monthEnd   = monthEndIso(year, month)

  const out: string[] = []
  for (const d of calendarDays) {
    if (d.barn_closed) continue
    if (d.date < monthStart || d.date > monthEnd) continue
    if (args.fromDate && d.date < args.fromDate) continue
    // Parse 'YYYY-MM-DD' as UTC midnight; getUTCDay avoids local-TZ drift
    // around DST or whatever the server happens to be running in.
    const parsed = new Date(d.date + 'T00:00:00Z')
    if (parsed.getUTCDay() !== dayIdx) continue
    out.push(d.date)
  }
  out.sort()
  return out
}

/** ISO 'YYYY-MM-01' for the given year+month (1-12). */
export function monthStartIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** ISO 'YYYY-MM-DD' for the last day of the given year+month. */
export function monthEndIso(year: number, month: number): string {
  // Day 0 of next month = last day of this month. UTC keeps us off DST hazards.
  const next = new Date(Date.UTC(year, month, 0))
  return next.toISOString().slice(0, 10)
}

/** Today's calendar date in ISO 'YYYY-MM-DD' (UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Add `n` calendar months to (year, month). month is 1-12. Wraps over
 * year boundaries. Useful for the rolling-window math.
 *
 *   addMonths(2026, 11, 1)  -> { year: 2026, month: 12 }
 *   addMonths(2026, 12, 1)  -> { year: 2027, month: 1 }
 *   addMonths(2026, 1, -1)  -> { year: 2025, month: 12 }
 */
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  // 0-indexed month math is easier; convert in/out at the boundaries.
  const total = (year * 12) + (month - 1) + n
  const newYear  = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return { year: newYear, month: newMonth }
}

/**
 * The "current month" of a given ISO date. Used to decide which month a
 * mid-month signup's first LessonMonth belongs to.
 */
export function monthOfIso(iso: string): { year: number; month: number } {
  // 'YYYY-MM-DD' — split first two segments, no Date parsing required.
  const [y, m] = iso.split('-')
  return { year: Number.parseInt(y, 10), month: Number.parseInt(m, 10) }
}
