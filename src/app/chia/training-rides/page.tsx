import { createAdminClient } from '@/lib/supabase/admin'
import WeekPicker from '../lessons-events/_components/WeekPicker'
import RiderSelector from './_components/RiderSelector'
import WeekGrid, { type GridHorse, type GridCell } from './_components/WeekGrid'
import { toISODate, startOfWeek, weekDays, parseISODate } from '../lessons-events/_lib/weekRange'
import { displayName } from '@/lib/displayName'

const ACTIVE_WINDOW_DAYS = 60

export default async function TrainingRidesPage({
  searchParams,
}: {
  searchParams: Promise<{ rider?: string; week?: string }>
}) {
  const params   = await searchParams
  const supabase = createAdminClient()

  // Selected week (Monday anchor)
  const anchor    = params.week ? parseISODate(params.week) : new Date()
  const monday    = startOfWeek(anchor)
  const mondayIso = toISODate(monday)
  const days      = weekDays(monday).map(toISODate)
  const sundayIso = days[6]

  // Active window for "training-active" horse computation (last 60 days rolling)
  const windowEnd   = new Date()
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - ACTIVE_WINDOW_DAYS)
  const windowStartIso = toISODate(windowStart)
  const windowEndIso   = toISODate(windowEnd)

  // Fetch providers — people with is_training_ride_provider = true
  const { data: provRaw } = await supabase
    .from('person')
    .select('id, first_name, last_name, preferred_name, default_training_ride_rate')
    .eq('is_training_ride_provider', true)
    .is('deleted_at', null)

  const providerIds = (provRaw ?? []).map(p => p.id)

  // Count recent rides per provider (last 60d) for sort + "N recent" label
  const { data: recentByProvider } = providerIds.length > 0
    ? await supabase
        .from('training_ride')
        .select('rider_id')
        .in('rider_id', providerIds)
        .gte('ride_date', windowStartIso)
        .lte('ride_date', windowEndIso)
        .is('deleted_at', null)
    : { data: [] }

  const providerRideCount = new Map<string, number>()
  for (const r of recentByProvider ?? []) {
    providerRideCount.set(r.rider_id, (providerRideCount.get(r.rider_id) ?? 0) + 1)
  }

  const providers = (provRaw ?? [])
    .map(p => ({
      id:        p.id,
      name:      displayName(p),
      rides_60d: providerRideCount.get(p.id) ?? 0,
      rate:      Number(p.default_training_ride_rate ?? 0),
    }))
    .sort((a, b) => b.rides_60d - a.rides_60d)

  // Determine selected rider
  const selectedRiderId = params.rider ?? providers[0]?.id ?? null

  // If no rider selected, render chrome only
  if (!selectedRiderId) {
    return (
      <div className="p-6">
        <Header mondayIso={mondayIso} providers={providers} selectedId={null} />
        <div className="mt-6 bg-white rounded-lg p-8 text-center max-w-lg">
          <p className="text-sm font-semibold text-[#191c1e] mb-1">No training ride providers yet</p>
          <p className="text-xs text-[#444650]">Flag someone in People → Training Ride Provider to get started.</p>
        </div>
      </div>
    )
  }

  // Training-active horses for the selected provider: at least 1 ride in the
  // last 60 days (Scheduled or Logged). Sort by recent ride count desc.
  const { data: activeRides } = await supabase
    .from('training_ride')
    .select('horse_id')
    .eq('rider_id', selectedRiderId)
    .gte('ride_date', windowStartIso)
    .lte('ride_date', windowEndIso)
    .is('deleted_at', null)

  const horseRideCount = new Map<string, number>()
  for (const r of activeRides ?? []) {
    horseRideCount.set(r.horse_id, (horseRideCount.get(r.horse_id) ?? 0) + 1)
  }

  const activeHorseIds = Array.from(horseRideCount.keys())

  const { data: allHorses } = await supabase
    .from('horse')
    .select('id, barn_name, status')
    .is('deleted_at', null)
    .order('barn_name')

  const activeHorses: GridHorse[] = (allHorses ?? [])
    .filter(h => activeHorseIds.includes(h.id))
    .map(h => ({
      id:        h.id,
      name:      h.barn_name,
      rides_60d: horseRideCount.get(h.id) ?? 0,
    }))
    .sort((a, b) => b.rides_60d - a.rides_60d)

  const activeIdSet = new Set(activeHorses.map(h => h.id))
  // "Available" = any horse not currently in the active grid. We don't filter
  // by `status` here because admin may legitimately schedule a ride on a
  // recently-arrived "pending" horse.
  const availableHorses: GridHorse[] = (allHorses ?? [])
    .filter(h => !activeIdSet.has(h.id))
    .map(h => ({ id: h.id, name: h.barn_name, rides_60d: 0 }))

  // Rides for this provider in the visible week
  const { data: weekRides } = await supabase
    .from('training_ride')
    .select('id, horse_id, ride_date, status, notes')
    .eq('rider_id', selectedRiderId)
    .gte('ride_date', mondayIso)
    .lte('ride_date', sundayIso)
    .is('deleted_at', null)

  const cellsByKey: Record<string, GridCell> = {}
  for (const r of weekRides ?? []) {
    // If horse isn't in the active grid (new horse scheduled this week), include it
    if (!activeIdSet.has(r.horse_id)) {
      const h = (allHorses ?? []).find(h => h.id === r.horse_id)
      if (h) {
        activeHorses.push({ id: h.id, name: h.barn_name, rides_60d: horseRideCount.get(h.id) ?? 0 })
        activeIdSet.add(h.id)
      }
    }
    cellsByKey[`${r.horse_id}:${r.ride_date}`] = {
      id:     r.id,
      status: r.status as GridCell['status'],
      notes:  r.notes,
    }
  }

  // Re-sort after potential additions
  activeHorses.sort((a, b) => b.rides_60d - a.rides_60d || a.name.localeCompare(b.name))

  return (
    <div className="p-6">
      <Header mondayIso={mondayIso} providers={providers} selectedId={selectedRiderId} />
      <div className="mt-5">
        <WeekGrid
          providerId={selectedRiderId}
          horses={activeHorses}
          weekDays={days}
          cellsByKey={cellsByKey}
          availableHorses={availableHorses}
        />
      </div>
    </div>
  )
}

function Header({
  mondayIso, providers, selectedId,
}: {
  mondayIso:  string
  providers:  Array<{ id: string; name: string; rides_60d: number; rate: number }>
  selectedId: string | null
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <RiderSelector providers={providers} selectedId={selectedId} />
      <WeekPicker currentWeekStart={mondayIso} />
    </div>
  )
}
