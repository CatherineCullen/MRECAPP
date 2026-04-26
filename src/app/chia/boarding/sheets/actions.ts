'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * Server actions for sign-up sheets. Admin-only at this layer; boarder claim/
 * release/note actions live alongside in claimSlot/releaseSlot/updateSlotNote
 * and gate on horse_contact ownership.
 */

type SheetMode = 'timed' | 'ordered'

export async function createSheet(args: {
  providerPersonId: string
  serviceId:        string
  date:             string  // YYYY-MM-DD
  mode:             SheetMode
  title:            string
  description:      string | null
  count:            number
  // Timed-mode only:
  startTime?:       string  // HH:MM
  durationMinutes?: number
}): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) return { error: 'Admin only' }

  const title = args.title.trim()
  if (!title) return { error: 'Title is required' }
  if (args.count < 1 || args.count > 50) {
    return { error: 'Slot count must be between 1 and 50' }
  }
  if (args.mode === 'timed') {
    if (!args.startTime || !args.durationMinutes || args.durationMinutes <= 0) {
      return { error: 'Timed sheets need a start time and slot duration' }
    }
  }

  const supabase = createAdminClient()

  // Anchor must be an active provider QR for this (provider, service).
  const { data: qr } = await supabase
    .from('provider_qr_code')
    .select('id')
    .eq('provider_person_id', args.providerPersonId)
    .eq('service_id', args.serviceId)
    .eq('is_active', true)
    .maybeSingle()
  if (!qr) {
    return { error: 'No active QR code for that provider + service. Create one in QR Codes first.' }
  }

  const { data: sheet, error: sheetErr } = await supabase
    .from('sign_up_sheet')
    .insert({
      provider_person_id: args.providerPersonId,
      service_id:         args.serviceId,
      date:               args.date,
      mode:               args.mode,
      title,
      description:        args.description?.trim() || null,
      created_by_id:      user.personId,
    })
    .select('id')
    .single()
  if (sheetErr || !sheet) return { error: sheetErr?.message ?? 'Could not create sheet' }

  // Generate slots back-to-back. Times are stored as 'HH:MM:SS'; the form
  // gives us 'HH:MM'.
  const slots = []
  for (let i = 0; i < args.count; i++) {
    if (args.mode === 'timed') {
      const [h, m] = args.startTime!.split(':').map(Number)
      const total  = h * 60 + m + i * args.durationMinutes!
      const hh     = String(Math.floor(total / 60) % 24).padStart(2, '0')
      const mm     = String(total % 60).padStart(2, '0')
      slots.push({
        sheet_id:         sheet.id,
        position:         i + 1,
        start_time:       `${hh}:${mm}:00`,
        duration_minutes: args.durationMinutes!,
      })
    } else {
      slots.push({
        sheet_id: sheet.id,
        position: i + 1,
      })
    }
  }

  const { error: slotErr } = await supabase.from('sign_up_sheet_slot').insert(slots)
  if (slotErr) {
    // Roll back the sheet so we don't leave an empty shell.
    await supabase.from('sign_up_sheet').delete().eq('id', sheet.id)
    return { error: slotErr.message }
  }

  revalidatePath('/chia/boarding/sheets')
  return { id: sheet.id }
}

export async function updateSheetMeta(args: {
  sheetId:     string
  title:       string
  description: string | null
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) return { error: 'Admin only' }

  const title = args.title.trim()
  if (!title) return { error: 'Title is required' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('sign_up_sheet')
    .update({
      title,
      description: args.description?.trim() || null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', args.sheetId)
  if (error) return { error: error.message }

  revalidatePath('/chia/boarding/sheets')
  revalidatePath(`/chia/boarding/sheets/${args.sheetId}`)
  return {}
}

export async function deleteSheet(sheetId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) return { error: 'Admin only' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('sign_up_sheet')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sheetId)
  if (error) return { error: error.message }

  revalidatePath('/chia/boarding/sheets')
  return {}
}

export async function deleteSlot(slotId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) return { error: 'Admin only' }

  const supabase = createAdminClient()

  // Block deletion if a horse is on it. Admin must release first; this avoids
  // surprising data loss when shuffling slots.
  const { data: slot } = await supabase
    .from('sign_up_sheet_slot')
    .select('horse_id, sheet_id')
    .eq('id', slotId)
    .maybeSingle()
  if (!slot) return { error: 'Slot not found' }
  if (slot.horse_id) {
    return { error: 'Release the slot before deleting it (a horse is currently signed up).' }
  }

  const { error } = await supabase.from('sign_up_sheet_slot').delete().eq('id', slotId)
  if (error) return { error: error.message }

  revalidatePath('/chia/boarding/sheets')
  revalidatePath(`/chia/boarding/sheets/${slot.sheet_id}`)
  return {}
}

/**
 * Claim a slot. Permission: admin OR a horse_contact for the chosen horse
 * with can_log_services or is_billing_contact (matches the "people who care
 * for the horse" boarder set).
 */
export async function claimSlot(args: {
  slotId:  string
  horseId: string
  note?:   string | null
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Sign in required' }

  const supabase = createAdminClient()

  // Permission check: admin always passes; otherwise must be a contact for
  // this horse.
  if (!user.isAdmin) {
    const { data: hc } = await supabase
      .from('horse_contact')
      .select('id, is_billing_contact, can_log_services')
      .eq('horse_id', args.horseId)
      .eq('person_id', user.personId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!hc || !(hc.is_billing_contact || hc.can_log_services)) {
      return { error: 'You are not connected to that horse' }
    }
  }

  // Atomic claim: only update if the slot is still open. Prevents two boarders
  // racing for the same slot.
  const { data: claimed, error } = await supabase
    .from('sign_up_sheet_slot')
    .update({
      horse_id:         args.horseId,
      signed_up_by_id:  user.personId,
      signed_up_at:     new Date().toISOString(),
      notes:            args.note?.trim() || null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', args.slotId)
    .is('horse_id', null)
    .select('sheet_id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!claimed) return { error: 'That slot was just taken — refresh to see the latest sheet.' }

  revalidatePath(`/chia/boarding/sheets/${claimed.sheet_id}`)
  revalidatePath('/my/sign-ups')
  return {}
}

export async function releaseSlot(slotId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Sign in required' }

  const supabase = createAdminClient()

  const { data: slot } = await supabase
    .from('sign_up_sheet_slot')
    .select('signed_up_by_id, sheet_id, horse_id')
    .eq('id', slotId)
    .maybeSingle()
  if (!slot) return { error: 'Slot not found' }
  if (!slot.horse_id) return { error: 'Slot is already open' }

  // Permission: admin or the original signer.
  if (!user.isAdmin && slot.signed_up_by_id !== user.personId) {
    return { error: 'You can only release your own sign-up' }
  }

  const { error } = await supabase
    .from('sign_up_sheet_slot')
    .update({
      horse_id:        null,
      signed_up_by_id: null,
      signed_up_at:    null,
      notes:           null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', slotId)
  if (error) return { error: error.message }

  revalidatePath(`/chia/boarding/sheets/${slot.sheet_id}`)
  revalidatePath('/my/sign-ups')
  return {}
}

export async function updateSlotNote(args: {
  slotId: string
  note:   string | null
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Sign in required' }

  const supabase = createAdminClient()

  const { data: slot } = await supabase
    .from('sign_up_sheet_slot')
    .select('signed_up_by_id, sheet_id, horse_id')
    .eq('id', args.slotId)
    .maybeSingle()
  if (!slot) return { error: 'Slot not found' }
  if (!slot.horse_id) return { error: 'Cannot add a note to an open slot' }

  if (!user.isAdmin && slot.signed_up_by_id !== user.personId) {
    return { error: 'You can only edit your own note' }
  }

  const { error } = await supabase
    .from('sign_up_sheet_slot')
    .update({
      notes:      args.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.slotId)
  if (error) return { error: error.message }

  revalidatePath(`/chia/boarding/sheets/${slot.sheet_id}`)
  revalidatePath('/my/sign-ups')
  return {}
}
