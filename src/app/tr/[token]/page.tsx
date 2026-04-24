import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import { loadTrainingRidesPageData } from '@/lib/trainingRideLogging'
import TrainingRidesClient from '@/app/my/training-rides/_components/TrainingRidesClient'
import {
  logRideByToken,
  unlogRideByToken,
  addLoggedRideByToken,
  scheduleRideByToken,
  unscheduleRideByToken,
} from './actions'

export const metadata = { title: 'Training Rides — Marlboro Ridge Equestrian Center' }

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function TrainingRideScanPage({
  params,
  searchParams,
}: {
  params:        Promise<{ token: string }>
  searchParams:  Promise<{ date?: string }>
}) {
  const { token } = await params
  const { date: dateParam } = await searchParams
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : todayDate()

  const supabase = createAdminClient()
  const { data: qr } = await supabase
    .from('training_ride_provider_qr')
    .select(`
      provider_person_id, is_active,
      person:person!training_ride_provider_qr_provider_person_id_fkey
        ( id, first_name, last_name, preferred_name, is_organization, organization_name, is_training_ride_provider )
    `)
    .eq('token', token)
    .maybeSingle()

  if (!qr || !qr.is_active || !qr.person) {
    return (
      <div className="min-h-screen bg-surface-low flex items-center justify-center p-6">
        <div className="bg-surface-lowest rounded-lg p-6 max-w-md text-center">
          <h1 className="text-base font-bold text-on-surface">QR code not active</h1>
          <p className="text-sm text-on-surface-muted mt-2">
            This QR code is no longer valid. Ask the barn owner for an updated one.
          </p>
        </div>
      </div>
    )
  }

  const { rides, recentHorses, allHorses } = await loadTrainingRidesPageData({
    providerId: qr.provider_person_id,
    date,
  })

  const providerName = displayName(qr.person)

  return (
    <div className="min-h-screen bg-surface-low">
      <header
        className="sticky top-0 z-20 bg-primary px-4 py-3"
        style={{ background: 'rgba(0,32,88,0.97)', backdropFilter: 'blur(12px)' }}
      >
        <div className="max-w-md mx-auto">
          <div className="text-white font-bold text-sm tracking-tight">Marlboro Ridge Equestrian Center</div>
          <div className="text-secondary/70 text-[11px] mt-0.5">Training ride logging · {providerName}</div>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-4">
        <TrainingRidesClient
          date={date}
          rides={rides}
          recentHorses={recentHorses}
          allHorses={allHorses}
          basePath={`/tr/${token}`}
          providerName={providerName}
          actions={{
            logRide:        logRideByToken.bind(null, token),
            unlogRide:      unlogRideByToken.bind(null, token),
            addLoggedRide:  addLoggedRideByToken.bind(null, token),
            scheduleRide:   scheduleRideByToken.bind(null, token),
            unscheduleRide: unscheduleRideByToken.bind(null, token),
          }}
        />
      </main>
    </div>
  )
}
