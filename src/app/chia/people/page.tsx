import { createAdminClient } from '@/lib/supabase/admin'
import PeopleFilters from './_components/PeopleFilters'
import AddPersonButton from './_components/AddPersonButton'
import InviteRiderButton from './_components/InviteRiderButton'
import PeopleTable, { type PersonRow } from './_components/PeopleTable'

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; inactive?: string }>
}) {
  const { role, inactive } = await searchParams
  const includeInactive = inactive === '1'
  const supabase = createAdminClient()

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  // Fetch people with roles + horse connections, recent lesson riders, and
  // anyone who is named as a guardian — all in parallel.
  const [{ data: people, error }, { data: recentRiders }, { data: guardianRefs }] = await Promise.all([
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name, email, phone,
        is_minor, is_organization, organization_name, is_training_ride_provider,
        person_role!person_role_person_id_fkey ( role, deleted_at ),
        horse_contact ( id, horse_id, horse ( barn_name ) )
      `)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
    // All riders with a lesson (not barn-cancelled) in the last 12 months
    supabase
      .from('lesson_rider')
      .select('rider_id, lesson!inner ( scheduled_at, status )')
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .gte('lesson.scheduled_at', twelveMonthsAgo.toISOString()),
    // IDs of anyone referenced as a guardian — they're active regardless of
    // other connections (they manage a minor's account).
    supabase
      .from('person')
      .select('guardian_id')
      .not('guardian_id', 'is', null)
      .is('deleted_at', null),
  ])

  if (error) throw error

  const activeRiderIds = new Set((recentRiders ?? []).map((r: any) => r.rider_id))
  const guardianIds    = new Set((guardianRefs ?? []).map((r: any) => r.guardian_id))

  // Staff roles that mark someone "active" on their own — they're barn workforce.
  const STAFF_ROLES = new Set(['instructor', 'admin', 'barn_owner', 'barn_worker', 'service_provider'])

  // Active = staff role, OR has a horse contact, OR has a recent lesson,
  // OR is a training-ride provider, OR is a guardian of someone.
  const filtered = (people ?? []).filter(p => {
    const roles = (p.person_role ?? [])
      .filter((r: any) => !r.deleted_at)
      .map((r: any) => r.role as string)
    const isActive =
      roles.some(r => STAFF_ROLES.has(r))
      || (p.horse_contact?.length ?? 0) > 0
      || activeRiderIds.has(p.id)
      || p.is_training_ride_provider === true
      || guardianIds.has(p.id)

    if (!includeInactive && !isActive) return false
    if (role && role !== 'all') {
      if (!roles.includes(role)) return false
    }
    return true
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-[#191c1e]">People</h1>
        <div className="flex items-center gap-2">
          <InviteRiderButton />
          <AddPersonButton />
        </div>
      </div>

      {/* Filters */}
      <PeopleFilters selectedRole={role ?? 'all'} includeInactive={includeInactive} />

      {/* Table */}
      <div className="mt-4 bg-white rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[#444650]">No people found.</div>
        ) : (
          <PeopleTable people={filtered.map<PersonRow>(person => {
            const roles = (person.person_role ?? [])
              .filter((r: any) => !r.deleted_at)
              .map((r: any) => r.role as string)
            const displayName = person.is_organization
              ? (person.organization_name ?? '')
              : [person.first_name, person.last_name].filter(Boolean).join(' ')
            return {
              id:                        person.id,
              display_name:              displayName,
              preferred_note:            person.preferred_name ? `"${person.preferred_name}"` : null,
              is_minor:                  !!person.is_minor,
              is_training_ride_provider: !!person.is_training_ride_provider,
              email:                     person.email ?? null,
              phone:                     person.phone ?? null,
              roles,
              horse_contact:             (person.horse_contact as PersonRow['horse_contact']) ?? [],
            }
          })} />
        )}
      </div>

      <div className="mt-2 text-xs text-[#444650]">
        {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
        {!includeInactive && ' (active only)'}
      </div>
    </div>
  )
}
