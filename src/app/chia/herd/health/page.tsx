import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import CatalogPanel from './_components/CatalogPanel'
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

const CELL_STYLES: Record<CellStatus, string> = {
  overdue:           'bg-[#ffdad6] text-[#b00020] font-semibold',
  due_soon:          'bg-[#ffddb3] text-[#7c4b00] font-medium',
  ok:                'text-[#191c1e]',
  essential_missing: 'text-[#c4c6d1] italic',
  blank:             '',
}

export default async function HerdHealthPage() {
  const supabase = createAdminClient()

  // Full catalog (active + inactive) for the management panel. The grid
  // below renders only active + show_in_herd_dashboard rows, filtered from
  // this same fetch to avoid a second query.
  const { data: catalog, error: typesError } = await supabase
    .from('health_item_type')
    .select('id, name, is_essential, show_in_herd_dashboard, default_interval_days, sort_order, is_active')
    .is('deleted_at', null)
    .order('sort_order')

  if (typesError) throw typesError

  const catalogRows: HealthItemTypeRow[] = (catalog ?? []) as HealthItemTypeRow[]
  const itemTypes = catalogRows.filter(t => t.is_active && t.show_in_herd_dashboard)

  // Load active horses
  const { data: horses, error: horsesError } = await supabase
    .from('horse')
    .select('id, barn_name')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  if (horsesError) throw horsesError

  // Load all health program items for these horses
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

  // Build lookup: horseId → typeId → item
  const lookup = new Map<string, Map<string, typeof programItems[0]>>()
  for (const item of programItems) {
    if (!lookup.has(item.horse_id)) lookup.set(item.horse_id, new Map())
    lookup.get(item.horse_id)!.set(item.health_item_type_id, item)
  }

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
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="bg-[#f2f4f7]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#444650] uppercase tracking-wider whitespace-nowrap sticky left-0 bg-[#f2f4f7] z-10">
                  Horse
                </th>
                {itemTypes.map(t => (
                  <th
                    key={t.id}
                    className="text-center px-3 py-2.5 text-xs font-semibold text-[#444650] uppercase tracking-wider whitespace-nowrap min-w-[110px]"
                  >
                    {t.name}
                    {t.is_essential && <span className="text-[#b00020] ml-0.5">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horses.map((horse, i) => {
                const horseItems = lookup.get(horse.id)
                return (
                  <tr key={horse.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}>
                    <td className={`px-4 py-2.5 sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}`}>
                      <Link
                        href={`/chia/herd/horses/${horse.id}`}
                        className="font-semibold text-[#191c1e] hover:text-[#002058] whitespace-nowrap"
                      >
                        {horse.barn_name}
                      </Link>
                    </td>
                    {itemTypes.map(t => {
                      const item    = horseItems?.get(t.id)
                      const status  = cellStatus(item?.next_due, t.is_essential, !!item)
                      const display = item?.next_due
                        ? new Date(item.next_due + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                        : status === 'essential_missing' ? 'no record'
                        : ''

                      return (
                        <td
                          key={t.id}
                          className={`px-3 py-2.5 text-center text-xs whitespace-nowrap ${CELL_STYLES[status]}`}
                        >
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-4 py-2.5 bg-[#f2f4f7] border-t border-[#c4c6d1]/20 flex items-center gap-5 flex-wrap">
          <span className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Legend</span>
          <span className="text-[10px] bg-[#ffdad6] text-[#b00020] font-semibold px-2 py-0.5 rounded">Overdue</span>
          <span className="text-[10px] bg-[#ffddb3] text-[#7c4b00] font-medium px-2 py-0.5 rounded">Due within 30 days</span>
          <span className="text-[10px] text-[#191c1e] px-2 py-0.5">OK</span>
          <span className="text-[10px] text-[#c4c6d1] italic px-2 py-0.5">no record (essential*)</span>
        </div>
      </div>
      )}
    </div>
  )
}
