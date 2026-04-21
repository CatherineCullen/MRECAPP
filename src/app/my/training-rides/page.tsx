import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { loadTrainingRidesPageData } from '@/lib/trainingRideLogging'
import TrainingRidesClient from './_components/TrainingRidesClient'
import { logMyRide, unlogMyRide, addMyLoggedRide } from './actions'

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

  const { rides, recentHorses, allHorses } = await loadTrainingRidesPageData({
    providerId: user.personId,
    date,
  })

  return (
    <TrainingRidesClient
      date={date}
      rides={rides}
      recentHorses={recentHorses}
      allHorses={allHorses}
      basePath="/my/training-rides"
      actions={{
        logRide:       logMyRide,
        unlogRide:     unlogMyRide,
        addLoggedRide: addMyLoggedRide,
      }}
    />
  )
}
