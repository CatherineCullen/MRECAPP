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

export type LoadedRideRow = {
  id:        string
  status:    'scheduled' | 'logged'
  notes:     string | null
  horseName: string
}

export type LoadedHorseLite = { horseId: string; name: string; recentCount?: number }

/**
 * Load the date-of-rides + horse pickers for one provider. Shared between the
 * signed-in /my/training-rides surface and the public /tr/<token> scan
 * surface so the two pages render identically.
 */
export async function loadTrainingRidesPageData(opts: {
  providerId: string
  date:       string
}): Promise<{
  rides:        LoadedRideRow[]
  recentHorses: { horseId: string; name: string; recentCount: number }[]
  allHorses:    LoadedHorseLite[]
}> {
  const supabase = createAdminClient()

  const [ridesRes, recent, horsesRes] = await Promise.all([
    supabase.from('training_ride')
      .select(`
        id, status, ride_date, notes, logged_at,
        horse:horse!training_ride_horse_id_fkey (id, barn_name)
      `)
      .eq('rider_id', opts.providerId)
      .eq('ride_date', opts.date)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    recentHorsesForTrainingProvider({ providerId: opts.providerId, days: 60 }),
    supabase.from('horse')
      .select('id, barn_name')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('barn_name'),
  ])

  const rides: LoadedRideRow[] = (ridesRes.data ?? []).map(r => {
    const horse = Array.isArray(r.horse) ? r.horse[0] : r.horse
    return {
      id:        r.id,
      status:    r.status as 'scheduled' | 'logged',
      notes:     r.notes,
      horseName: horse?.barn_name ?? 'Horse',
    }
  })

  const dayHorseIds = new Set(
    (ridesRes.data ?? []).map(r => {
      const h = Array.isArray(r.horse) ? r.horse[0] : r.horse
      return h?.id
    }).filter(Boolean),
  )

  const recentHorses = recent.filter(r => !dayHorseIds.has(r.horseId))
  const allHorses: LoadedHorseLite[] = (horsesRes.data ?? [])
    .filter(h => !!h.barn_name && !dayHorseIds.has(h.id))
    .map(h => ({ horseId: h.id, name: h.barn_name as string }))

  return { rides, recentHorses, allHorses }
}
