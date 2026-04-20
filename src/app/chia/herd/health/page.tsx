import { createAdminClient } from '@/lib/supabase/admin'
import CatalogPanel from './_components/CatalogPanel'
import HerdHealthTable, { type HerdHealthRow, type HealthItemCol } from './_components/HerdHealthTable'
import { type HealthItemTypeRow } from './_components/CatalogRow'

const DUE_SOON_DAYS = 30

type CellStatus = 'overdue' | 'due_soon' | 'ok' | 'essential_missing' | 'blank'

function cellStatus(nextDue: string | null | undefined, isEssential: boolean, hasRecord: boolean): CellStatus {
  if (!hasRecord) return isEssential ? 'essential_missing' : 'blank'
  if (!nextDue) return 'ok'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(nextDue + 'T00:00:00')
  const daysOut = Math.floor((due.getTime() - today.getTime()) / 86400000)
  if (daysOut < 0) return 'overdue'
  if (daysOut <= DUE_SOON_DAYS) return 'due_soon'
  return 'ok'
}

export default async function HerdHealthPage() {
  const supabase = createAdminClient()

  const { data: catalog, error: typesError } = await supabase
    .from('health_item_type')
    .select('id, name, is_essential, show_in_herd_dashboard, default_interval_days, sort_order, is_active')
    .is('deleted_at', null)
    .order('sort_order')

  if (typesError) throw typesError

  const catalogRows: HealthItemTypeRow[] = (catalog ?? []) as HealthItemTypeRow[]
  const itemTypes = catalogRows.filter(t => t.is_active && t.show_in_herd_dashboard)

  const { data: horses, error: horsesError } = await supabase
    .from('horse')
    .select('id, barn_name')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  if (horsesError) throw horsesError

  const horseIds = horses.map(h => h.id)
  const typeIds  = itemTypes.map(t => t.id)

  let programItems: { horse_id: string; health_item_type_id: string; last_done: string | null; next_due: string | null }[] = []

  if (horseIds.length > 0 && typeIds.length > 0) {
    const { data, error } = await supabase
      .from('health_program_item')
      .select('horse_id, health_item_type_id, last_done, next_due')
      .in('horse_id', horseIds)
      .in('health_item_type_id', typeIds)
      .is('deleted_at', null)
    if (error) throw error
    programItems = data ?? []
  }

  // Build lookup: horseId → typeId → item. When duplicates exist (e.g. a type
  // recorded via vet import AND a standalone import), keep the one with the
  // later next_due so the most current record wins.
  const lookup = new Map<string, Map<string, typeof programItems[0]>>()
  for (const item of programItems) {
    if (!lookup.has(item.horse_id)) lookup.set(item.horse_id, new Map())
    const horseMap = lookup.get(item.horse_id)!
    const existing = horseMap.get(item.health_item_type_id)
    if (!existing || (item.next_due ?? '') > (existing.next_due ?? '')) {
      horseMap.set(item.health_item_type_id, item)
    }
  }

  // Pre-shape rows for the client component
  const tableRows: HerdHealthRow[] = horses.map(horse => {
    const horseItems = lookup.get(horse.id)
    const cells: HerdHealthRow['cells'] = {}
    for (const t of itemTypes) {
      const item    = horseItems?.get(t.id)
      const status  = cellStatus(item?.next_due, t.is_essential, !!item)
      const display = item?.next_due
        ? new Date(item.next_due + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : status === 'essential_missing' ? 'no record'
        : ''
      cells[t.id] = { status, display }
    }
    return { id: horse.id, barn_name: horse.barn_name, cells }
  })

  const cols: HealthItemCol[] = itemTypes.map(t => ({
    id:           t.id,
    name:         t.name,
    is_essential: t.is_essential,
  }))

  return (
    <div className="p-6">
      <CatalogPanel rows={catalogRows} />

      {itemTypes.length === 0 && (
        <p className="text-sm text-[#444650]">
          No health items configured for the dashboard. Open <strong>Manage health items</strong> above to add one.
        </p>
      )}

      {itemTypes.length > 0 && horses.length === 0 && (
        <p className="text-sm text-[#444650]">No active horses.</p>
      )}

      {itemTypes.length > 0 && horses.length > 0 && (
        <HerdHealthTable horses={tableRows} itemTypes={cols} />
      )}
    </div>
  )
}
