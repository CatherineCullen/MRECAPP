'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  logRide as logRideAdmin,
  unlogRide as unlogRideAdmin,
  addLoggedRide as addLoggedRideAdmin,
  scheduleRide as scheduleRideAdmin,
  unscheduleRide as unscheduleRideAdmin,
} from '@/app/chia/training-rides/actions'

/**
 * Token-authed wrappers around the CHIA training-ride actions. The token
 * identifies the provider — the helper (or provider) scanning a printed QR
 * never has to sign in. Mutations are attributed to the provider's personId
 * via actingAsPersonId, so the resulting training_ride row is identical to
 * one written from the signed-in /my/training-rides surface.
 *
 * Scheduling is exposed via the QR path alongside logging (2026-04-24) —
 * originally the QR was log-only, but that created a confusing UX cliff:
 * a provider scanning the QR would see a schedule section they couldn't
 * use and have no clear prompt to go find their login. The token is the
 * credential either way; logging is arguably more consequential than
 * scheduling (it's what lands on chronology / Google Cal / billing). The
 * rotate-token admin button remains the real safety rail if a QR leaks.
 */

async function resolveProviderFromToken(token: string): Promise<{ error?: string; providerId?: string }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('training_ride_provider_qr')
    .select('provider_person_id, is_active')
    .eq('token', token)
    .maybeSingle()
  if (!data || !data.is_active) return { error: 'This QR code is no longer active.' }
  return { providerId: data.provider_person_id }
}

async function ownsRide(rideId: string, providerId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { data: ride } = await supabase
    .from('training_ride')
    .select('rider_id')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ride) return { error: 'Ride not found.' }
  if (ride.rider_id !== providerId) return { error: 'Not authorized.' }
  return {}
}

export async function logRideByToken(
  token: string,
  rideId: string,
  notes: string | null,
): Promise<{ error?: string }> {
  const auth = await resolveProviderFromToken(token)
  if (auth.error) return { error: auth.error }
  const owns = await ownsRide(rideId, auth.providerId!)
  if (owns.error) return owns

  const res = await logRideAdmin(rideId, notes, auth.providerId)
  revalidatePath(`/tr/${token}`)
  return res
}

export async function unlogRideByToken(token: string, rideId: string): Promise<{ error?: string }> {
  const auth = await resolveProviderFromToken(token)
  if (auth.error) return { error: auth.error }
  const owns = await ownsRide(rideId, auth.providerId!)
  if (owns.error) return owns

  const res = await unlogRideAdmin(rideId)
  revalidatePath(`/tr/${token}`)
  return res
}

export async function addLoggedRideByToken(
  token: string,
  args: { horseId: string; date: string; notes?: string },
): Promise<{ error?: string; id?: string }> {
  const auth = await resolveProviderFromToken(token)
  if (auth.error) return { error: auth.error }

  const res = await addLoggedRideAdmin({
    riderId:          auth.providerId!,
    horseId:          args.horseId,
    date:             args.date,
    notes:            args.notes,
    actingAsPersonId: auth.providerId,
  })
  revalidatePath(`/tr/${token}`)
  return res
}

export async function scheduleRideByToken(
  token: string,
  args: { horseId: string; date: string },
): Promise<{ error?: string; id?: string }> {
  const auth = await resolveProviderFromToken(token)
  if (auth.error) return { error: auth.error }

  const res = await scheduleRideAdmin({
    riderId: auth.providerId!,
    horseId: args.horseId,
    date:    args.date,
  })
  revalidatePath(`/tr/${token}`)
  return res
}

export async function unscheduleRideByToken(
  token: string,
  rideId: string,
): Promise<{ error?: string }> {
  const auth = await resolveProviderFromToken(token)
  if (auth.error) return { error: auth.error }

  // Reuse ownsRide to confirm this provider's ride. Also double-check status
  // at the DB level — unscheduleRideAdmin may assume a scheduled row.
  const supabase = createAdminClient()
  const { data: ride } = await supabase
    .from('training_ride')
    .select('rider_id, status')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ride) return { error: 'Ride not found.' }
  if (ride.rider_id !== auth.providerId) return { error: 'Not authorized.' }
  if (ride.status !== 'scheduled') return { error: 'Only scheduled rides can be unscheduled.' }

  const res = await unscheduleRideAdmin(rideId)
  revalidatePath(`/tr/${token}`)
  return res
}
