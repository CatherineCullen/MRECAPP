import { createAdminClient } from '@/lib/supabase/admin'
import CalendarManagement from './_components/CalendarManagement'

/**
 * Barn calendar — manages barn_closed and is_makeup_day flags per date.
 * Replaces the old per-quarter calendar UI (which lived inside the now-
 * deleted Quarters config tab) with a flat, month-grouped view.
 *
 * Rows are surfaced from 90 days ago through 12 months out so admins can
 * see recent history and the upcoming horizon together. Admins can seed
 * new months from the inline "Add month" button if the horizon needs to
 * extend further.
 */
export default async function CalendarPage() {
  const supabase = createAdminClient()

  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 90)
  const end = new Date(today)
  end.setMonth(end.getMonth() + 12)

  const { data: days, error } = await supabase
    .from('barn_calendar_day')
    .select('id, date, barn_closed, is_makeup_day, notes')
    .gte('date', start.toISOString().slice(0, 10))
    .lte('date', end.toISOString().slice(0, 10))
    .order('date', { ascending: true })

  if (error) throw error

  return <CalendarManagement days={days ?? []} />
}
