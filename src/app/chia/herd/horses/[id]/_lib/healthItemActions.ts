'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Actions for the per-horse Health Items section — add / edit / soft-delete
 * a `health_program_item` row. The import flows still own the sync path from
 * vet + Coggins JSON; these actions are for admins fixing or manually adding
 * schedule rows directly on a horse.
 *
 * Partial-index note: the unique index on (horse_id, health_item_type_id) is
 * WHERE deleted_at IS NULL. supabase.upsert can't target a partial index, so
 * add/edit use explicit select-then-insert / update. See import/actions.ts
 * `syncHealthProgramItem` for the full story.
 */

export async function addHorseHealthItem(
  horseId: string,
  input: { typeId: string; lastDone: string | null; nextDue: string | null },
): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  if (!input.typeId) return { error: 'Pick a health item type.' }

  // Block if an active row already exists for this (horse, type). Admin
  // should Edit it instead — we don't silently merge.
  const { data: existing, error: selErr } = await supabase
    .from('health_program_item')
    .select('id')
    .eq('horse_id', horseId)
    .eq('health_item_type_id', input.typeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (selErr) return { error: selErr.message }
  if (existing) return { error: 'This horse already has a row for that health item — edit that one instead.' }

  const { error } = await supabase
    .from('health_program_item')
    .insert({
      horse_id:            horseId,
      health_item_type_id: input.typeId,
      last_done:           input.lastDone,
      next_due:            input.nextDue,
    })
  if (error) return { error: error.message }

  revalidatePath(`/chia/herd/horses/${horseId}`)
  return {}
}

export async function updateHorseHealthItem(
  horseId: string,
  itemId:  string,
  input: { typeId: string; lastDone: string | null; nextDue: string | null },
): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  if (!input.typeId) return { error: 'Pick a health item type.' }

  // If the admin changed the type on this row, guard against colliding with
  // another active row for the new type on the same horse.
  const { data: current, error: curErr } = await supabase
    .from('health_program_item')
    .select('health_item_type_id')
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
