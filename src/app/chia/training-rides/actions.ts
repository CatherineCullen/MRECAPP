'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Add a TrainingRide for (provider × horse × date) with status 'scheduled'.
 * unit_price is snapshotted from the provider's default_training_ride_rate
 * so future rate changes don't rewrite history.
 */
export async function scheduleRide(args: {
  riderId: string
  horseId: string
  date:    string      // 'YYYY-MM-DD'
}): Promise<{ error?: string; id?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  // Read provider's current rate for the snapshot
  const { data: provider, error: provErr } = await supabase
    .from('person')
    .select('default_training_ride_rate, is_training_ride_provider')
    .eq('id', args.riderId)
    .single()
  if (provErr || !provider) return { error: provErr?.message ?? 'Provider not found.' }
  if (!provider.is_training_ride_provider) return { error: 'This person is not a training ride provider.' }

  const { data, error } = await supabase
    .from('training_ride')
    .insert({
      rider_id:   args.riderId,
      horse_id:   args.horseId,
      ride_date:  args.date,
      status:     'scheduled',
      unit_price: provider.default_training_ride_rate,
      created_by: user?.personId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to schedule ride.' }

  revalidatePath('/chia/training-rides')
  return { id: data.id }
}

/**
 * Remove a scheduled TrainingRide (soft-delete). Only Scheduled rides can be
 * unscheduled — once logged, the ride is historical + billable.
 */
export async function unscheduleRide(rideId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('training_ride')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', rideId)
    .eq('status', 'scheduled')   // refuse if logged

  if (error) return { error: error.message }
  revalidatePath('/chia/training-rides')
  return {}
}

/**
 * Mark a scheduled ride as logged (admin retroactive logging).
 * In production the mobile provider screen will also call this.
 * Leaves unit_price intact (snapshot taken at schedule time).
 */
export async function logRide(rideId: string, notes: string | null): Promise<{ error?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('training_ride')
    .update({
      status:       'logged',
      logged_at:    new Date().toISOString(),
      logged_by_id: user?.personId ?? null,
      notes:        notes?.trim() || null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', rideId)
    .eq('status', 'scheduled')

  if (error) return { error: error.message }
  revalidatePath('/chia/training-rides')
  return {}
}

/**
 * Unlog a ride — put it back to 'scheduled'. For admin corrections only;
 * clears logged_at/by.
 */
export async function unlogRide(rideId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('training_ride')
    .update({
      status:       'scheduled',
      logged_at:    null,
      logged_by_id: null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', rideId)
    .eq('status', 'logged')

  if (error) return { error: error.message }
  revalidatePath('/chia/training-rides')
  return {}
}

/**
 * One-shot "add a logged ride directly" — admin retroactively entering a
 * ride that happened without being scheduled first.
 */
export async function addLoggedRide(args: {
  riderId: string
  horseId: string
  date:    string
  notes?:  string
}): Promise<{ error?: string; id?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  const { data: provider, error: provErr } = await supabase
    .from('person')
    .select('default_training_ride_rate, is_training_ride_provider')
    .eq('id', args.riderId)
    .single()
  if (provErr || !provider) return { error: provErr?.message ?? 'Provider not found.' }
  if (!provider.is_training_ride_provider) return { error: 'This person is not a training ride provider.' }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('training_ride')
    .insert({
      rider_id:     args.riderId,
      horse_id:     args.horseId,
      ride_date:    args.date,
      status:       'logged',
      unit_price:   provider.default_training_ride_rate,
      notes:        args.notes?.trim() || null,
      logged_at:    now,
      logged_by_id: user?.personId ?? null,
      created_by:   user?.personId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to add ride.' }

  revalidatePath('/chia/training-rides')
  return { id: data.id }
}
