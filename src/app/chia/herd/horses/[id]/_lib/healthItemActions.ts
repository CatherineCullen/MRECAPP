'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Actions for the per-horse Health Items section — add / edit / soft-delete
 * a `health_program_item` row, *and* log a companion `health_event` row on
 * every add/edit so the per-dose note sticks around in history.
 *
 * Why two tables on every save:
 *   - health_program_item  = the schedule (last_done, next_due). One per
 *                            (horse, type). Overwritten in place.
 *   - health_event         = the immutable log. New row per save. Carries
 *                            the freeform `notes` that the UI surfaces on
 *                            the current row's expand disclosure.
 *
 * Partial-index note: the unique index on (horse_id, health_item_type_id) is
 * WHERE deleted_at IS NULL. supabase.upsert can't target a partial index, so
 * add/edit use explicit select-then-insert / update. See import/actions.ts
 * `syncHealthProgramItem` for the full story.
 */

type EditInput = {
  typeId:   string
  lastDone: string | null
  nextDue:  string | null
  notes:    string | null
}

type AddInput = {
  typeId:      string | null
  newTypeName: string | null
  lastDone:    string | null
  nextDue:     string | null
  notes:       string | null
}

// Resolve or create a health_item_type by name. Mirrors the rider-side helper
// in my/horses/[id]/health/actions.ts — case-insensitive name match, reactivate
// if deactivated, else insert. Keeps us safe against the partial-unique index
// on lower(name) WHERE deleted_at IS NULL.
async function resolveTypeId(
  supabase: ReturnType<typeof createAdminClient>,
  name:     string,
  personId: string | null,
): Promise<{ typeId?: string; error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Pick a type or enter a new name.' }

  const { data: match, error: matchErr } = await supabase
    .from('health_item_type')
    .select('id, is_active')
    .ilike('name', trimmed)
    .is('deleted_at', null)
    .maybeSingle()
  if (matchErr) return { error: matchErr.message }

  if (match) {
    if (!match.is_active) {
      const { error: reactErr } = await supabase
        .from('health_item_type')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', match.id)
      if (reactErr) return { error: reactErr.message }
    }
    return { typeId: match.id }
  }

  const { data: created, error: insErr } = await supabase
    .from('health_item_type')
    .insert({ name: trimmed, is_active: true, created_by: personId })
    .select('id')
    .single()
  if (insErr || !created) return { error: insErr?.message ?? 'Failed to create type.' }
  return { typeId: created.id }
}

async function insertHealthEvent(
  supabase: ReturnType<typeof createAdminClient>,
  horseId:  string,
  typeId:   string,
  input:    EditInput,
  personId: string | null,
) {
  // Only log an event if there's *something* to log — at minimum a date or
  // a note. Otherwise a trivial "type changed" edit would leave ghost rows.
  if (!input.lastDone && !input.notes) return
  await supabase.from('health_event').insert({
    horse_id:            horseId,
    health_item_type_id: typeId,
    administered_on:     input.lastDone ?? new Date().toISOString().slice(0, 10),
    next_due:            input.nextDue,
    notes:               input.notes,
    recorded_by:         personId,
  })
}

export async function addHorseHealthItem(
  horseId: string,
  input:   AddInput,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  const supabase = createAdminClient()

  let typeId = input.typeId
  if (!typeId) {
    const r = await resolveTypeId(supabase, input.newTypeName ?? '', user?.personId ?? null)
    if (r.error || !r.typeId) return { error: r.error ?? 'Failed to resolve type.' }
    typeId = r.typeId
  }

  // Block if an active row already exists for this (horse, type). Admin
  // should Edit it instead — we don't silently merge.
  const { data: existing, error: selErr } = await supabase
    .from('health_program_item')
    .select('id')
    .eq('horse_id', horseId)
    .eq('health_item_type_id', typeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (selErr) return { error: selErr.message }
  if (existing) return { error: 'This horse already has a row for that health item — edit that one instead.' }

  const { error } = await supabase
    .from('health_program_item')
    .insert({
      horse_id:            horseId,
      health_item_type_id: typeId,
      last_done:           input.lastDone,
      next_due:            input.nextDue,
    })
  if (error) return { error: error.message }

  await insertHealthEvent(supabase, horseId, typeId, {
    typeId, lastDone: input.lastDone, nextDue: input.nextDue, notes: input.notes,
  }, user?.personId ?? null)

  revalidatePath(`/chia/herd/horses/${horseId}`)
  return {}
}

export async function updateHorseHealthItem(
  horseId: string,
  itemId:  string,
  input:   EditInput,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  const supabase = createAdminClient()

  if (!input.typeId) return { error: 'Pick a health item type.' }

  // If the admin changed the type on this row, guard against colliding with
  // another active row for the new type on the same horse.
  const { data: current, error: curErr } = await supabase
    .from('health_program_item')
    .select('health_item_type_id, last_done')
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle()
  if (curErr) return { error: curErr.message }
  if (!current) return { error: 'Health item not found.' }

  if (current.health_item_type_id !== input.typeId) {
    const { data: collision } = await supabase
      .from('health_program_item')
      .select('id')
      .eq('horse_id', horseId)
      .eq('health_item_type_id', input.typeId)
      .is('deleted_at', null)
      .maybeSingle()
    if (collision) return { error: 'This horse already has a row for that type — delete one first.' }
  }

  const { error } = await supabase
    .from('health_program_item')
    .update({
      health_item_type_id: input.typeId,
      last_done:           input.lastDone,
      next_due:            input.nextDue,
      updated_at:          new Date().toISOString(),
    })
    .eq('id', itemId)
  if (error) return { error: error.message }

  await insertHealthEvent(supabase, horseId, input.typeId, input, user?.personId ?? null)

  revalidatePath(`/chia/herd/horses/${horseId}`)
  return {}
}

export async function deleteHorseHealthItem(
  horseId: string,
  itemId:  string,
): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('health_program_item')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
  if (error) return { error: error.message }

  revalidatePath(`/chia/herd/horses/${horseId}`)
  return {}
}
