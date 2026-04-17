import { createAdminClient } from '@/lib/supabase/admin'
import CalendarManagement from './_components/CalendarManagement'

export default async function CalendarPage() {
  const supabase = createAdminClient()

  const { data: quarters, error } = await supabase
    .from('quarter')
    .select(`
      id, label, start_date, end_date, is_active,
      barn_calendar_day (
        id, date, barn_closed, is_makeup_day, notes
      )
    `)
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  if (error) throw error

  const shaped = (quarters ?? []).map(q => ({
    id:         q.id,
    label:      q.label,
    start_date: q.start_date,
    end_date:   q.end_date,
    is_active:  q.is_active,
    days: ((q.barn_calendar_day ?? []) as Array<{
      id: string
      date: string
      barn_closed: boolean
      is_makeup_day: boolean
      notes: string | null
    }>).sort((a, b) => a.date.localeCompare(b.date)),
  }))

  return <CalendarManagement quarters={shaped} />
}
