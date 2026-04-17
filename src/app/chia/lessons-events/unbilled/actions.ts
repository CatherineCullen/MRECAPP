'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createInvoiceForUnbilled } from '@/lib/stripe/unbilledInvoice'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Bundle a person's unbilled lesson packages AND events into ONE Stripe
 * invoice. Admin-only. All packageIds must belong to the same billedToId
 * (billed_to_id), and all eventIds must have the same host_id. The Unbilled
 * Products UI already groups them by person so that's invariant by the time
 * we get here.
 */
export async function sendPackageInvoice(params: {
  billedToId: string
  packageIds: string[]
  eventIds?: string[]
}): Promise<{
  stripeInvoiceId?: string
  hostedInvoiceUrl?: string | null
  chiaInvoiceId?: string
  packageCount?: number
  eventCount?: number
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  try {
    const result = await createInvoiceForUnbilled({
      billedToId: params.billedToId,
      packageIds: params.packageIds,
      eventIds:   params.eventIds ?? [],
    })
    revalidatePath('/chia/lessons-events/unbilled')
    revalidatePath(`/chia/people/${params.billedToId}`)
    revalidatePath('/chia/lessons-events')
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

/**
 * Inline price correction for an unbilled package.
 *
 * Admin-only. Refuses to edit a package already attached to an invoice —
 * at that point the price lives in invoice_line_item.unit_price too, and
 * silently diverging them is a bug surface. If admin needs to correct an
 * invoiced package, that's a separate (unimplemented) "credit / reissue"
 * flow, not a price edit.
 */
export async function updatePackagePrice(params: {
  packageId: string
  newPrice: number
}): Promise<{ newPrice?: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  if (!Number.isFinite(params.newPrice) || params.newPrice <= 0) {
    return { error: 'Price must be greater than $0' }
  }

  const db = createAdminClient()

  const { data: pkg, error: readErr } = await db
    .from('lesson_package')
    .select('id, invoice_id, billed_to_id')
    .eq('id', params.packageId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!pkg) return { error: 'Package not found' }
  if (pkg.invoice_id) {
    return { error: 'This package is already on an invoice. Price cannot be edited.' }
  }

  const { error: updErr } = await db
    .from('lesson_package')
    .update({ package_price: params.newPrice })
    .eq('id', params.packageId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${pkg.billed_to_id}`)
  return { newPrice: params.newPrice }
}

/**
 * Inline price correction for an unbilled event. Mirrors updatePackagePrice
 * — refuses to edit once the event is attached to an invoice.
 */
export async function updateEventPrice(params: {
  eventId: string
  newPrice: number
}): Promise<{ newPrice?: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  if (!Number.isFinite(params.newPrice) || params.newPrice <= 0) {
    return { error: 'Price must be greater than $0' }
  }

  const db = createAdminClient()

  const { data: event, error: readErr } = await db
    .from('event')
    .select('id, invoice_id, host_id')
    .eq('id', params.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!event) return { error: 'Event not found' }
  if (event.invoice_id) {
    return { error: 'This event is already on an invoice. Price cannot be edited.' }
  }

  const { error: updErr } = await db
    .from('event')
    .update({ price: params.newPrice })
    .eq('id', params.eventId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${event.host_id}`)
  revalidatePath('/chia/lessons-events')
  return { newPrice: params.newPrice }
}

/**
 * Mark a lesson_package or event as "don't bill" (comp, cash-paid, traded,
 * etc). Keeps the row on the calendar / person profile but removes it from
 * Unbilled Products. Reversible via unskipBilling.
 *
 * Refused if the source already has an invoice_id — billing already happened
 * via the normal path, no need to skip. Different from "cancel" which changes
 * status; skip is strictly about "we're not going to Stripe-invoice this."
 */
export async function skipBilling(params: {
  source:  'package' | 'event'
  id:      string
  reason?: string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()
  const table = params.source === 'package' ? 'lesson_package' : 'event'
  const personFk = params.source === 'package' ? 'billed_to_id' : 'host_id'

  const { data: row, error: readErr } = await db
    .from(table)
    .select(`id, invoice_id, billing_skipped_at, ${personFk}`)
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!row) return { error: 'Not found' }
  if ((row as any).invoice_id) return { error: 'Already invoiced — skip does not apply.' }
  if ((row as any).billing_skipped_at) return { error: 'Already marked as skipped.' }

  const { error: updErr } = await db
    .from(table)
    .update({
      billing_skipped_at:     new Date().toISOString(),
      billing_skipped_reason: params.reason?.trim() || null,
    })
    .eq('id', params.id)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath('/chia/lessons-events')
  const personId = (row as any)[personFk]
  if (personId) revalidatePath(`/chia/people/${personId}`)
  if (params.source === 'event') revalidatePath(`/chia/lessons-events/events/${params.id}`)
  return {}
}

/**
 * Undo skipBilling — the source goes back into the Unbilled Products queue.
 * Useful if an admin accidentally skipped or if terms changed.
 */
export async function unskipBilling(params: {
  source: 'package' | 'event'
  id:     string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()
  const table = params.source === 'package' ? 'lesson_package' : 'event'
  const personFk = params.source === 'package' ? 'billed_to_id' : 'host_id'

  const { data: row, error: readErr } = await db
    .from(table)
    .select(`id, billing_skipped_at, ${personFk}`)
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!row) return { error: 'Not found' }
  if (!(row as any).billing_skipped_at) return { error: 'This row is not currently skipped.' }

  const { error: updErr } = await db
    .from(table)
    .update({
      billing_skipped_at:     null,
      billing_skipped_reason: null,
    })
    .eq('id', params.id)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath('/chia/lessons-events')
  const personId = (row as any)[personFk]
  if (personId) revalidatePath(`/chia/people/${personId}`)
  if (params.source === 'event') revalidatePath(`/chia/lessons-events/events/${params.id}`)
  return {}
}
