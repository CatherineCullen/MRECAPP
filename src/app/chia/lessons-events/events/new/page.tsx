import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NewEventForm from './_components/NewEventForm'
import { displayName } from '@/lib/displayName'

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; time?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const params = await searchParams
  const clickedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined
  const clickedTime = params.time && /^\d{2}:\d{2}$/.test(params.time) ? params.time : undefined

  const supabase = createAdminClient()

  const [{ data: eventTypes }, { data: people }] = await Promise.all([
    supabase
      .from('event_type')
      .select('code, label, default_duration_minutes, calendar_color, calendar_badge, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name, is_organization, organization_name,
        person_role!person_role_person_id_fkey ( role, deleted_at )
      `)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
  ])

  const getRoles = (p: any): string[] =>
    (p.person_role ?? []).filter((r: any) => !r.deleted_at).map((r: any) => r.role)

  const hosts = (people ?? []).map(p => ({ id: p.id, name: displayName(p) }))
  const instructors = (people ?? [])
    .filter(p => getRoles(p).includes('instructor'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link
          href="/chia/lessons-events"
          className="text-xs text-[#444650] hover:text-[#002058] hover:underline"
        >
          ← Calendar
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">New Event</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Birthday parties, clinics, therapy sessions — anything that sits on the calendar but isn't a lesson.
        </p>
      </div>

      <NewEventForm
        eventTypes={(eventTypes ?? []).map(t => ({
          code:             t.code,
          label:            t.label,
          defaultDuration:  t.default_duration_minutes,
          calendarColor:    t.calendar_color,
          calendarBadge:    t.calendar_badge,
        }))}
        hosts={hosts}
        instructors={instructors}
        suggestedDate={clickedDate}
        suggestedTime={clickedTime}
      />
    </div>
  )
}
