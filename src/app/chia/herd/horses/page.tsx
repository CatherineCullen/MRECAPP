import { createAdminClient } from '@/lib/supabase/admin'
import AddHorseButton from './_components/AddHorseButton'
import HorseStatusFilter from './_components/HorseStatusFilter'
import HorsesTable, { type HorseRow } from './_components/HorsesTable'

type StatusFilter = 'active' | 'pending' | 'away' | 'archived' | 'all'

export default async function HorsesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const statusFilter = (params.status ?? 'active') as StatusFilter

  const supabase = createAdminClient()

  let query = supabase
    .from('horse')
    .select(`
      id,
      barn_name,
      registered_name,
      breed,
      gender,
      status,
      lesson_horse,
      color,
      horse_contact ( person_id, deleted_at, person!horse_contact_person_id_fkey ( id, first_name, last_name, organization_name, is_organization, deleted_at ) )
    `)
    .is('deleted_at', null)
    .order('barn_name')

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data: horses, error } = await query

  if (error) throw error

  const rows: HorseRow[] = (horses ?? []).map(h => ({
    id:              h.id,
    barn_name:       h.barn_name,
    registered_name: h.registered_name,
    breed:           h.breed,
    gender:          h.gender,
    status:          h.status,
    lesson_horse:    !!h.lesson_horse,
    horse_contact:   ((h.horse_contact as any[]) ?? []).filter(
      hc => !hc.deleted_at && !hc.person?.deleted_at
    ) as HorseRow['horse_contact'],
  }))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <HorseStatusFilter current={statusFilter} />
        <AddHorseButton />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg p-10 text-center">
          <p className="text-[#444650] text-sm">
            {statusFilter === 'active'
              ? 'No active horses. Add your first horse to get started.'
              : `No horses with status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <HorsesTable horses={rows} />
      )}
    </div>
  )
}
