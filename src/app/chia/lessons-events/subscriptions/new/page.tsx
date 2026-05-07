import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import NewSubscriptionForm from './_components/NewSubscriptionForm'
import { type DayOfWeek, DAYS, monthOfIso, monthEndIso, addMonths, todayIso } from '@/lib/lessons/monthly/dates'
import { getAllPerLessonPrices } from '@/lib/lessons/monthly/pricing'
import { displayName } from '@/lib/displayName'

const VALID_DAYS: readonly DayOfWeek[] = DAYS

/**
 * New Lesson Subscription page (monthly model — ADR-0019).
 *
 * Loads people / horses / per-lesson rates / 3 months of barn calendar
 * days, then renders the form. The form computes the 3-month preview
 * client-side from the calendar days (so admin sees their slot dates as
 * they pick day-of-week without a server round trip).
 */
export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ time?: string; day?: string }>
}) {
  const sp = await searchParams

  // Click-from-calendar prefills (validated, then passed through). The
  // legacy startDate prefill went away — there's no manual start date in
  // the monthly model; signups always begin "now."
  const prefillTime = sp.time && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : undefined
  const prefillDay  = sp.day && VALID_DAYS.includes(sp.day as DayOfWeek)
    ? (sp.day as DayOfWeek)
    : undefined

  const supabase = createAdminClient()

  // Calendar window: today through end of month +2 (covers the 3-month
  // rolling window the form previews).
  const today                  = todayIso()
  const { year, month }        = monthOfIso(today)
  const windowEndYM            = addMonths(year, month, 2)
  const windowEndIso           = monthEndIso(windowEndYM.year, windowEndYM.month)

  const [{ data: people }, { data: horses }, { data: calendarDays }, prices] = await Promise.all([
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
      .from('barn_calendar_day')
      .select('date, barn_closed')
      .gte('date', today)
      .lte('date', windowEndIso)
      .order('date'),
    getAllPerLessonPrices(supabase),
  ])

  type RawPerson = NonNullable<typeof people>[number]
  type PersonRoleRow = { role: string | null; deleted_at: string | null }
  const getRoles = (p: RawPerson): string[] => {
    const roles = (p.person_role ?? []) as PersonRoleRow[]
    return roles.filter((r) => !r.deleted_at).map((r) => r.role).filter((r): r is string => Boolean(r))
  }

  // Riders: any non-organization person. The rider role auto-assigns on
  // first subscription create. `defaultBilledToId` is the autofill for
  // the "Billed to" field: adults bill themselves, minors bill guardian.
  const riders = (people ?? [])
    .filter((p) => !p.is_organization)
    .map((p) => ({
      id:                p.id,
      name:              displayName(p),
      defaultBilledToId: (p.is_minor && p.guardian_id) ? p.guardian_id : p.id,
    }))

  // Billed-to: any person (organizations allowed — a company could pay).
  const billers = (people ?? []).map((p) => ({ id: p.id, name: displayName(p) }))

  // Instructors: filtered to the instructor role.
  const instructors = (people ?? [])
    .filter((p) => getRoles(p).includes('instructor'))
    .map((p) => ({ id: p.id, name: displayName(p) }))

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Subscriptions
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">New Lesson Subscription</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Reserve a recurring weekly slot. The first month is prorated from today; the next two months are pending until the monthly invoice batch sends.
        </p>
      </div>

      <NewSubscriptionForm
        riders={riders}
        billers={billers}
        instructors={instructors}
        horses={(horses ?? []).map((h) => ({ id: h.id, name: h.barn_name }))}
        calendarDays={(calendarDays ?? []).map((d) => ({
          date:        d.date,
          barn_closed: d.barn_closed,
        }))}
        perLessonPriceStandard={prices.standard}
        perLessonPriceBoarder={prices.boarder}
        prefillTime={prefillTime}
        prefillDay={prefillDay}
      />
    </div>
  )
}
