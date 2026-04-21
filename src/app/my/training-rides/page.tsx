import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { recentHorsesForTrainingProvider } from '@/lib/trainingRideLogging'
import TrainingRidesClient, { type RideRow, type HorseLite } from './_components/TrainingRidesClient'

export const metadata = { title: 'Training Rides — Marlboro Ridge Equestrian Center' }

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function MyTrainingRidesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')
  if (!(user.isTrainingRideProvider || user.isAdmin)) redirect('/my')

  const { date: dateParam } = await searchParams
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : todayDate()

  const db = createAdminClient()

  const [ridesRes, recent, horsesRes] = await Promise.all([
    db.from('training_ride')
      .select(`
        id, status, ride_date, notes, logged_at,
        horse:horse!training_ride_horse_id_fkey (id, barn_name)
      `)
      .eq('rider_id', user.personId)
      .eq('ride_date', date)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    recentHorsesForTrainingProvider({ providerId: user.personId, days: 60 }),
    db.from('horse')
      .select('id, barn_name')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('barn_name'),
  ])

  const rides: RideRow[] = (ridesRes.data ?? []).map(r => {
    const horse = Array.isArray(r.horse) ? r.horse[0] : r.horse
    return {
      id:        r.id,
      status:    r.status as 'scheduled' | 'logged',
      notes:     r.notes,
      horseName: horse?.barn_name ?? 'Horse',
    }
  })

  // Horses not already rided-for today (so "Log another" doesn't duplicate)
  const dayHorseIds = new Set(
    (ridesRes.data ?? []).map(r => {
      const h = Array.isArray(r.horse) ? r.horse[0] : r.horse
      return h?.id
    }).filter(Boolean),
  )

  const recentFiltered = recent.filter(r => !dayHorseIds.has(r.horseId))
  const allHorses: HorseLite[] = (horsesRes.data ?? [])
    .filter(h => !!h.barn_name && !dayHorseIds.has(h.id))
    .map(h => ({ horseId: h.id, name: h.barn_name as string }))

  return (
    <TrainingRidesClient
      date={date}
      rides={rides}
      recentHorses={recentFiltered}
      allHorses={allHorses}
    />
  )
}
