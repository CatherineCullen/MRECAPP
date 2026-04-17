import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import NewSubscriptionForm from './_components/NewSubscriptionForm'
import type { DayOfWeek } from '../../_lib/generateLessonDates'
import { displayName } from '@/lib/displayName'

const VALID_DAYS: readonly DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; time?: string; day?: string }>
}) {
  const sp = await searchParams

  // Click-from-calendar prefills (validated, then passed through)
  const prefillDate = sp.startDate && /^\d{4}-\d{2}-\d{2}$/.test(sp.startDate) ? sp.startDate : undefined
  const prefillTime = sp.time      && /^\d{2}:\d{2}$/.test(sp.time)      ? sp.time      : undefined
  const prefillDay  = sp.day && VALID_DAYS.includes(sp.day as DayOfWeek)
    ? (sp.day as DayOfWeek)
    : undefined

  const supabase = createAdminClient()

  const [{ data: people }, { data: horses }, { data: quarters }, { data: calendarDays }] = await Promise.all([
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name, is_organization, organization_name,
        is_minor, guardian_id,
        person_role!person_role_person_id_fkey ( role, deleted_at )
      `)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
    supabase
      .from('horse')
      .select('id, barn_name')
      .is('deleted_at', null)
      .order('barn_name'),
    supabase
      .from('quarter')
      .select('id, label, start_date, end_date, is_active')
      .is('deleted_at', null)
      .order('start_date'),
    supabase
      .from('barn_calendar_day')
      .select('date, barn_closed, is_makeup_day, quarter_id')
      .order('date'),
  ])

  // Active roles only (filter soft-deleted)
  const getRoles = (p: any): string[] =>
    (p.person_role ?? []).filter((r: any) => !r.deleted_at).map((r: any) => r.role)

  // Riders: any non-organization person. The rider role will be auto-assigned
  // on first subscription create.
  //
  // `defaultBilledToId` is the autofill for the "Billed to" field when this
  // rider is picked: adults bill themselves; minors bill their guardian.
  const riders = (people ?? [])
    .filter(p => !p.is_organization)
    .map(p => ({
      id:               p.id,
      name:             displayName(p),
      defaultBilledToId: (p.is_minor && p.guardian_id) ? p.guardian_id : p.id,
    }))

  // Billed-to: any person (organizations allowed — a company could pay).
  const billers = (people ?? [])
    .map(p => ({ id: p.id, name: displayName(p) }))

  // Instructors: still filtered to the instructor role — this is a safety net
  // against accidentally assigning a lesson to the wrong person.
  const instructors = (people ?? [])
    .filter(p => getRoles(p).includes('instructor'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  // Only quarters whose end date hasn't passed — no point enrolling into history
  const today = new Date().toISOString().slice(0, 10)
  const availableQuarters = (quarters ?? [])
    .filter(q => q.end_date >= today)
    .map(q => ({
      id:         q.id,
      label:      q.label,
      start_date: q.start_date,
      end_date:   q.end_date,
      is_active:  q.is_active,
    }))

  // Calendar days keyed by quarter_id — NewSubscriptionForm filters by selected quarter
  const daysByQuarter: Record<string, { date: string; barn_closed: boolean; is_makeup_day: boolean }[]> = {}
  for (const d of calendarDays ?? []) {
    if (!d.quarter_id) continue
    if (!daysByQuarter[d.quarter_id]) daysByQuarter[d.quarter_id] = []
    daysByQuarter[d.quarter_id].push({
      date:          d.date,
      barn_closed:   d.barn_closed,
      is_makeup_day: d.is_makeup_day,
    })
  }

  // If the admin click-started from a date on the calendar, pre-select the
  // quarter that contains that date. Falls through to the form's own default
  // (active quarter) if no prefill or no matching quarter.
  const prefillQuarterId = prefillDate
    ? availableQuarters.find(q => prefillDate >= q.start_date && prefillDate <= q.end_date)?.id
    : undefined

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Subscriptions
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">New Lesson Subscription</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Enroll a rider in a recurring weekly slot for a quarter. The app will generate individual lesson records for each date.
        </p>
      </div>

      <NewSubscriptionForm
        riders={riders}
        billers={billers}
        instructors={instructors}
        horses={(horses ?? []).map(h => ({ id: h.id, name: h.barn_name }))}
        quarters={availableQuarters}
        daysByQuarter={daysByQuarter}
        prefillQuarterId={prefillQuarterId}
        prefillStartDate={prefillDate}
        prefillTime={prefillTime}
        prefillDay={prefillDay}
      />
    </div>
  )
}
