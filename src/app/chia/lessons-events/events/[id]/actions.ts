'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Edit the editable fields on an event. Deliberately does NOT allow changing
 * event_type_code or host_id after creation — either is a big enough change
 * that the admin should delete + recreate, and it keeps this action from
 * silently breaking invoice line-item semantics when an event is already
 * invoiced. If an event is already on an invoice, price becomes uneditable
 * (same rule as updateEventPrice / updatePackagePrice).
 */
export async function updateEvent(params: {
  eventId:         string
  scheduledAt:     string            // 'YYYY-MM-DDTHH:MM:00'
  durationMinutes: number
  instructorId:    string | null
  title:           string
  price:           number
  partySize:       number | null
  notes:           string | null
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized.' }

  if (!params.title.trim())                          return { error: 'Title is required.' }
  if (!params.scheduledAt)                           return { error: 'Date and time are required.' }
  if (!Number.isFinite(params.durationMinutes) || params.durationMinutes <= 0) {
    return { error: 'Duration must be a positive number of minutes.' }
  }
  if (!Number.isFinite(params.price) || params.price < 0) {
    return { error: 'Price must be a non-negative number.' }
  }
  if (params.price === 0) {
    return { error: 'Price cannot be $0.' }
  }
  if (params.partySize !== null && (!Number.isFinite(params.partySize) || params.partySize <= 0)) {
    return { error: 'Party size must be a positive number or blank.' }
  }

  const db = createAdminClient()

  // Guard: if the event is already on an invoice, price cannot change (would
  // diverge from the invoice_line_item.unit_price snapshot). Everything else
  // is still editable.
  const { data: existing, error: readErr } = await db
    .from('event')
    .select('id, price, invoice_id, host_id, status')
    .eq('id', params.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!existing) return { error: 'Event not found.' }
  if (existing.invoice_id && Number(existing.price) !== params.price) {
    return { error: 'This event is already on an invoice — price cannot be changed.' }
  }

  const { error: updErr } = await db
    .from('event')
    .update({
      scheduled_at:     params.scheduledAt,
      duration_minutes: params.durationMinutes,
      instructor_id:    params.instructorId,
      title:            params.title.trim(),
      price:            params.price,
      party_size:       params.partySize,
      notes:            params.notes?.trim() || null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', params.eventId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/events/${params.eventId}`)
  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${existing.host_id}`)
  return {}
}

/**
 * Cancel an event. Sets status to 'cancelled' — does NOT soft-delete the row
 * (keeps it visible on the calendar with a strike-through so the admin can
 * see a history of what was booked). If the event was already invoiced, this
 * doesn't refund anything; that's a separate manual Stripe action.
 */
export async function cancelEvent(params: { eventId: string; reason?: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized.' }

  const db = createAdminClient()

  const { data: existing, error: readErr } = await db
    .from('event')
    .select('id, status, host_id')
    .eq('id', params.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!existing) return { error: 'Event not found.' }
  if (existing.status === 'cancelled') return { error: 'Event is already cancelled.' }

  const { error: updErr } = await db
    .from('event')
    .update({
      status:     'cancelled',
      updated_at: new Date().toISOString(),
      ...(params.reason ? { notes: params.reason } : {}),
    })
    .eq('id', params.eventId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/events/${params.eventId}`)
  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${existing.host_id}`)
  return {}
}

/**
 * Soft-delete an event. Refuses if already on an invoice — deleting a billed
 * event would orphan the invoice_line_item.event_id FK. Admin should cancel
 * (not delete) billed events, or reverse the invoice first.
 */
export async function deleteEvent(params: { eventId: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized.' }

  const db = createAdminClient()

  const { data: existing, error: readErr } = await db
    .from('event')
    .select('id, invoice_id, host_id')
    .eq('id', params.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!existing) return { error: 'Event not found.' }
  if (existing.invoice_id) {
    return { error: 'This event is already on an invoice. Cancel it instead of deleting.' }
  }

  const { error: updErr } = await db
    .from('event')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.eventId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events')
  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${existing.host_id}`)
  redirect('/chia/lessons-events')
}
