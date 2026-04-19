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
 *
 * Billing cascade: if this ride has already been rolled into a boarder
 * billing line (training_ride.billing_line_item_id is set), we first
 * decrement that line's quantity and re-render its description. If the line
 * would drop to zero rides, we soft-delete it. The ride's FK is then
 * cleared so subsequent billing surfaces don't think it's still attached.
 *
 * Refuses to unlog if the billing line has moved downstream (Reviewed,
 * invoiced, or already deleted) — at that point the billing is no longer
 * cleanly editable, so admin must Un-approve / Void first.
 */
export async function unlogRide(rideId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  const { data: ride, error: readErr } = await supabase
    .from('training_ride')
    .select('id, status, billing_line_item_id, rider_id, unit_price, horse_id')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!ride) return { error: 'Ride not found.' }
  if (ride.status !== 'logged') return { error: 'This ride is not logged.' }

  if (ride.billing_line_item_id) {
    const { data: line, error: lineErr } = await supabase
      .from('billing_line_item')
      .select('id, quantity, description, status, billing_period_start, deleted_at')
      .eq('id', ride.billing_line_item_id)
      .maybeSingle()
    if (lineErr) return { error: lineErr.message }
    if (!line)   return { error: 'Billing line not found.' }

    if (line.deleted_at) {
      // Already deleted — just clear the stale FK below.
    } else if (line.billing_period_start) {
      return { error: 'This ride is on a generated invoice. Void the invoice first.' }
    } else if (line.status !== 'draft') {
      return { error: 'This ride is on a Reviewed billing line. Un-approve it first, then unlog.' }
    } else {
      const newQty = (line.quantity ?? 1) - 1

      if (newQty <= 0) {
        const { error: delErr } = await supabase
          .from('billing_line_item')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', line.id)
        if (delErr) return { error: delErr.message }
      } else {
        const { data: prov } = await supabase
          .from('person')
          .select('first_name, last_name, preferred_name, is_organization, organization_name')
          .eq('id', ride.rider_id)
          .maybeSingle()
        const providerName = prov
          ? (prov.is_organization ? (prov.organization_name ?? 'Provider')
            : [prov.preferred_name ?? prov.first_name, prov.last_name].filter(Boolean).join(' ') || 'Provider')
          : 'Provider'
        const rate = Number(ride.unit_price ?? 0)
        const rateStr = rate.toFixed(2).replace(/\.00$/, '')

        const { error: updErr } = await supabase
          .from('billing_line_item')
          .update({
            quantity:    newQty,
            description: `Training Rides — ${providerName} (${newQty} × $${rateStr})`,
          })
          .eq('id', line.id)
        if (updErr) return { error: updErr.message }
      }
    }
  }

  const { error } = await supabase
    .from('training_ride')
    .update({
      status:               'scheduled',
      logged_at:            null,
      logged_by_id:         null,
      billing_line_item_id: null,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', rideId)
    .eq('status', 'logged')

  if (error) return { error: error.message }
  revalidatePath('/chia/training-rides')
  revalidatePath('/chia/boarding/invoices')
  return {}
}

/**
 * Update a provider's default per-ride rate. Snapshot semantics mean existing
 * scheduled + logged rides keep their original unit_price; only rides
 * scheduled AFTER this change pick up the new rate. That's the point — a
 * rate change mid-month doesn't silently rewrite last week's billing.
 *
 * Admin-only. Guards against negative values and non-provider persons.
 */
export async function updateProviderRate(args: {
  providerId: string
  newRate:    number
}): Promise<{ error?: string; newRate?: number }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  if (!Number.isFinite(args.newRate) || args.newRate < 0) {
    return { error: 'Rate must be 0 or greater.' }
  }

  const supabase = createAdminClient()

  const { data: prov, error: readErr } = await supabase
    .from('person')
    .select('id, is_training_ride_provider')
    .eq('id', args.providerId)
    .is('deleted_at', null)
    .maybeSingle()
  if (readErr) return { error: readErr.message }
  if (!prov) return { error: 'Provider not found.' }
  if (!prov.is_training_ride_provider) {
    return { error: 'This person is not a training ride provider.' }
  }

  const { error } = await supabase
    .from('person')
    .update({
      default_training_ride_rate: args.newRate,
      updated_at:                 new Date().toISOString(),
    })
    .eq('id', args.providerId)
  if (error) return { error: error.message }

  revalidatePath('/chia/training-rides')
  revalidatePath('/chia/boarding/services')
  revalidatePath(`/chia/people/${args.providerId}`)
  return { newRate: args.newRate }
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
