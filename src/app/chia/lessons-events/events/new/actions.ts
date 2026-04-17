'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Create a calendar Event (birthday party, clinic, equine therapy, other).
 *
 * Events are a separate entity from lessons — they share the calendar grid
 * but not lesson semantics (no lesson_type, no makeup tokens, no subscription
 * linkage, configurable duration). See migration 20260417000001.
 *
 * Admin-only. Host is the billed Person (one-Person model; no attendee list
 * in v1 per Catherine's call).
 */
export type CreateEventArgs = {
  eventTypeCode:   string                        // FK to event_type.code
  scheduledAt:     string                        // 'YYYY-MM-DDTHH:MM:00' naive wall-clock
  durationMinutes: number
  hostId:          string                        // billed + host Person
  instructorId:    string | null                 // optional (external clinician etc.)
  title:           string
  price:           number
  partySize:       number | null
  notes:           string | null
}

export async function createEvent(
  args: CreateEventArgs,
): Promise<{ error?: string; eventId?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized.' }

  // --- Validate ------------------------------------------------------------
  if (!args.eventTypeCode)                          return { error: 'Event type is required.' }
  if (!args.scheduledAt)                            return { error: 'Date and time are required.' }
  if (!args.hostId)                                 return { error: 'Host is required.' }
  if (!args.title.trim())                           return { error: 'Title is required.' }
  if (!Number.isFinite(args.durationMinutes) || args.durationMinutes <= 0) {
    return { error: 'Duration must be a positive number of minutes.' }
  }
  if (!Number.isFinite(args.price) || args.price < 0) {
    return { error: 'Price must be a non-negative number.' }
  }
  // Same anti-footgun rule as lesson products — $0 clutters unbilled list.
  if (args.price === 0) {
    return { error: 'Price cannot be $0. Set a real price or delete the event if it is free.' }
  }
  if (args.partySize !== null && (!Number.isFinite(args.partySize) || args.partySize <= 0)) {
    return { error: 'Party size must be a positive number or blank.' }
  }

  const supabase = createAdminClient()

  const { data: created, error: insertErr } = await supabase
    .from('event')
    .insert({
      event_type_code:  args.eventTypeCode,
      scheduled_at:     args.scheduledAt,
      duration_minutes: args.durationMinutes,
      host_id:          args.hostId,
      instructor_id:    args.instructorId,
      title:            args.title.trim(),
      price:            args.price,
      party_size:       args.partySize,
      notes:            args.notes?.trim() || null,
      status:           'scheduled' as const,
      created_by:       user.personId,
    })
    .select('id')
    .single()

  if (insertErr || !created) {
    return { error: insertErr?.message ?? 'Failed to create event.' }
  }

  revalidatePath('/chia/lessons-events')
  revalidatePath('/chia/lessons-events/events')
  revalidatePath('/chia/lessons-events/unbilled')
  return { eventId: created.id }
}
