'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

type UpsertArgs = {
  id?:          string
  name:         string
  description?: string
  is_billable:  boolean
  unit_price?:  number | null   // null/undefined ok for non-billable
}

/**
 * Create or update a single a la carte service. Monthly Board is separate —
 * this path never flips is_recurring_monthly, never creates a second recurring
 * service, and the DB's unique-index on is_recurring_monthly enforces that.
 */
export async function upsertService(args: UpsertArgs): Promise<{ error?: string; id?: string }> {
  const supabase = createAdminClient()
  const user     = await getCurrentUser()
  const now      = new Date().toISOString()

  const name = args.name.trim()
  if (!name) return { error: 'Name is required' }

  // Null out price for non-billable services so we never carry a stale number
  const unit_price = args.is_billable ? (args.unit_price ?? null) : null
  if (args.is_billable && unit_price != null && unit_price < 0) {
    return { error: 'Price must be 0 or greater' }
  }

  if (args.id) {
    const { error } = await supabase
      .from('board_service')
      .update({
        name,
        description: args.description?.trim() || null,
        is_billable: args.is_billable,
        unit_price,
        updated_at:  now,
      })
      .eq('id', args.id)
      .eq('is_recurring_monthly', false)  // safety: never touch Monthly Board from here
    if (error) return { error: error.message }
    revalidatePath('/chia/boarding/services')
    return { id: args.id }
  }

  const { data, error } = await supabase
    .from('board_service')
    .insert({
      name,
      description:          args.description?.trim() || null,
      is_billable:          args.is_billable,
      is_recurring_monthly: false,
      unit_price,
      is_active:            true,
      created_by:           user?.personId ?? null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/chia/boarding/services')
  return { id: data.id }
}

/**
 * Flip active state. Deactivated services no longer appear in logging UIs but
 * existing log entries remain intact (they snapshotted is_billable/unit_price
 * at log time).
 */
export async function setServiceActive(id: string, active: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('board_service')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('is_recurring_monthly', false)
  if (error) return { error: error.message }
  revalidatePath('/chia/boarding/services')
  return {}
}

/**
 * Update the Monthly Board rate. No other fields editable from the UI — name
 * and behaviour are fixed.
 */
export async function updateMonthlyBoardRate(unit_price: number): Promise<{ error?: string }> {
  if (unit_price < 0) return { error: 'Rate must be 0 or greater' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('board_service')
    .update({ unit_price, updated_at: new Date().toISOString() })
    .eq('is_recurring_monthly', true)
  if (error) return { error: error.message }
  revalidatePath('/chia/boarding/services')
  return {}
}
