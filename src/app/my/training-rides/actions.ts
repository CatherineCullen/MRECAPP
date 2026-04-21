'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import {
  logRide as logRideAdmin,
  unlogRide as unlogRideAdmin,
  addLoggedRide as addLoggedRideAdmin,
  scheduleRide as scheduleRideAdmin,
  unscheduleRide as unscheduleRideAdmin,
} from '@/app/chia/training-rides/actions'

/**
 * Provider-facing wrappers around the CHIA training-ride actions. They verify
 * the caller is the ride's provider (or an admin) before delegating, so a
 * signed-in provider can't mutate another provider's rides.
 */

async function requireProvider(): Promise<{ error?: string; personId?: string; isAdmin?: boolean }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }
  if (!(user.isTrainingRideProvider || user.isAdmin)) {
    return { error: 'Not authorized.' }
  }
  return { personId: user.personId, isAdmin: user.isAdmin }
}

export async function logMyRide(rideId: string, notes: string | null): Promise<{ error?: string }> {
  const auth = await requireProvider()
  if (auth.error) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: ride } = await supabase
    .from('training_ride')
    .select('rider_id')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ride) return { error: 'Ride not found.' }
  if (!auth.isAdmin && ride.rider_id !== auth.personId) return { error: 'Not authorized.' }

  const res = await logRideAdmin(rideId, notes)
  revalidatePath('/my/training-rides')
  return res
}

export async function unlogMyRide(rideId: string): Promise<{ error?: string }> {
  const auth = await requireProvider()
  if (auth.error) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: ride } = await supabase
    .from('training_ride')
    .select('rider_id')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ride) return { error: 'Ride not found.' }
  if (!auth.isAdmin && ride.rider_id !== auth.personId) return { error: 'Not authorized.' }

  const res = await unlogRideAdmin(rideId)
  revalidatePath('/my/training-rides')
  return res
}

export async function scheduleMyRide(args: {
  horseId: string
  date:    string
}): Promise<{ error?: string; id?: string }> {
  const auth = await requireProvider()
  if (auth.error) return { error: auth.error }

  const res = await scheduleRideAdmin({
    riderId: auth.personId!,
    horseId: args.horseId,
    date:    args.date,
  })
  revalidatePath('/my/training-rides')
  return res
}

export async function unscheduleMyRide(rideId: string): Promise<{ error?: string }> {
  const auth = await requireProvider()
  if (auth.error) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: ride } = await supabase
    .from('training_ride')
    .select('rider_id, status')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ride) return { error: 'Ride not found.' }
  if (!auth.isAdmin && ride.rider_id !== auth.personId) return { error: 'Not authorized.' }
  if (ride.status !== 'scheduled') return { error: 'Only scheduled rides can be unscheduled.' }

  const res = await unscheduleRideAdmin(rideId)
  revalidatePath('/my/training-rides')
  return res
}

export async function addMyLoggedRide(args: {
  horseId: string
  date:    string
  notes?:  string
}): Promise<{ error?: string; id?: string }> {
  const auth = await requireProvider()
  if (auth.error) return { error: auth.error }

  const res = await addLoggedRideAdmin({
    riderId: auth.personId!,
    horseId: args.horseId,
    date:    args.date,
    notes:   args.notes,
  })
  revalidatePath('/my/training-rides')
  return res
}
