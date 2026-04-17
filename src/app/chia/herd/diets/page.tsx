import { createAdminClient } from '@/lib/supabase/admin'
import DietTable from './_components/DietTable'

export default async function DietsPage() {
  const supabase = createAdminClient()

  const { data: horses } = await supabase
    .from('horse')
    .select(`
      id, barn_name, status,
      diet_record!diet_record_horse_id_fkey (
        id, am_feed, am_supplements, am_hay,
        pm_feed, pm_supplements, pm_hay,
        notes, version, deleted_at
      )
    `)
    .is('deleted_at', null)
    .in('status', ['active', 'pending'])
    .order('barn_name')

  const rows = (horses ?? []).map((h: any) => {
    const diet = (h.diet_record as any[])?.find((d: any) => !d.deleted_at) ?? null
    return {
      id:        h.id,
      barn_name: h.barn_name,
      status:    h.status,
      diet,
    }
  })

  return (
    <div className="p-6">
      <DietTable rows={rows} />
    </div>
  )
}
