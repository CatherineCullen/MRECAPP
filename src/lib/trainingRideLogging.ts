import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Horses this training ride provider has ridden in the last N days, sorted by
 * frequency desc. Used to populate the "Log another horse" picker on the
 * provider's mobile screen — mirrors recentHorsesForService for board
 * services.
 */
export async function recentHorsesForTrainingProvider(opts: {
  providerId: string
  days:       number
}): Promise<{ horseId: string; name: string; recentCount: number }[]> {
  const supabase = createAdminClient()
  const since    = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000)
  const sinceDate = since.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('training_ride')
    .select(`
      horse_id,
      horse:horse!training_ride_horse_id_fkey ( id, barn_name )
    `)
    .eq('rider_id', opts.providerId)
    .gte('ride_date', sinceDate)
    .is('deleted_at', null)

  const counts = new Map<string, { name: string; n: number }>()
  for (const row of data ?? []) {
    const name = row.horse?.barn_name
    if (!name) continue
    const existing = counts.get(row.horse_id)
    if (existing) existing.n += 1
    else counts.set(row.horse_id, { name, n: 1 })
  }
  return Array.from(counts.entries())
    .map(([id, v]) => ({ horseId: id, name: v.name, recentCount: v.n }))
    .sort((a, b) => b.recentCount - a.recentCount || a.name.localeCompare(b.name))
}
