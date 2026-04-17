// Shared helper — used by both preview (client) and action (server) so
// the dates we show in the preview are exactly the dates we create.

export const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const
export type DayOfWeek = typeof DAYS[number]

export type CalendarDay = {
  date:          string   // ISO 'YYYY-MM-DD'
  barn_closed:   boolean
  is_makeup_day: boolean
}

export type GenerateArgs = {
  dayOfWeek:    DayOfWeek
  startDate:    string     // inclusive
  endDate:      string     // inclusive (quarter end_date)
  calendarDays: CalendarDay[]
  maxLessons?:  number     // default 12
}

/**
 * Returns every ISO date in [startDate, endDate] that:
 *   - falls on the target day of week
 *   - is NOT barn_closed
 *   - is NOT a makeup day
 * Capped at `maxLessons` (default 12).
 *
 * Notes:
 *  - We use the barn_calendar_day table as the source of truth — dates missing
 *    from the calendar are skipped (meaning: if the quarter wasn't seeded, no
 *    lessons generate). This is a feature, not a bug.
 *  - Calendar days outside [startDate, endDate] are ignored.
 */
export function generateLessonDates(args: GenerateArgs): string[] {
  const { dayOfWeek, startDate, endDate, calendarDays } = args
  const max = args.maxLessons ?? 12
  const dayIdx = DAYS.indexOf(dayOfWeek)
  if (dayIdx < 0) return []

  const out: string[] = []
  for (const d of calendarDays) {
    if (d.barn_closed || d.is_makeup_day) continue
    if (d.date < startDate || d.date > endDate) continue
    // JS Date parses 'YYYY-MM-DD' as UTC midnight — getUTCDay to avoid TZ drift.
    const parsed = new Date(d.date + 'T00:00:00Z')
    if (parsed.getUTCDay() !== dayIdx) continue
    out.push(d.date)
  }
  out.sort()
  return out.slice(0, max)
}
