'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { getRiderScope } from '../../../_lib/riderScope'

async function assertAccess(horseId: string) {
  const user = await getCurrentUser()
  if (!user?.personId) throw new Error('Not signed in')

  const supabase = createAdminClient()
  const riderIds = await getRiderScope(user.personId)
  const { data: connection } = await supabase
    .from('horse_contact')
    .select('id')
    .eq('horse_id', horseId)
    .in('person_id', riderIds)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!connection && !user.isAdmin) throw new Error('Not authorized')
  return { user, supabase }
}

export async function addMyHorseHealthItem(
  horseId: string,
  input: {
    typeId:      string | null
    newTypeName: string | null
    lastDone:    string | null
    nextDue:     string | null
  },
): Promise<{ error?: string }> {
  const { user, supabase } = await assertAccess(horseId)

  let typeId = input.typeId

  // Freeform new type. Case-insensitive unique-name match: reuse any existing
  // (non-deleted) row, reactivating if needed — avoids admin cleanup churn
  // and the unique-index collision on (lower(name)) WHERE deleted_at IS NULL.
  if (!typeId) {
    const name = (input.newTypeName ?? '').trim()
    if (!name) return { error: 'Pick a type or enter a new name.' }

    const { data: match, error: matchErr } = await supabase
      .from('health_item_type')
      .select('id, is_active')
      .ilike('name', name)
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
      typeId = match.id
    } else {
      const { data: created, error: insErr } = await supabase
        .from('health_item_type')
        .insert({
          name,
          is_active:  true,
          created_by: user?.personId ?? null,
        })
        .select('id')
        .single()
      if (insErr || !created) return { error: insErr?.message ?? 'Failed to create type.' }
      typeId = created.id
    }
  }

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

  revalidatePath(`/my/horses/${horseId}`)
  return {}
}

export async function updateMyHorseHealthItem(
  horseId: string,
  itemId:  string,
  input: { typeId: string; lastDone: string | null; nextDue: string | null },
): Promise<{ error?: string }> {
  if (!input.typeId) return { error: 'Pick a health item type.' }

  const { supabase } = await assertAccess(horseId)

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

  revalidatePath(`/my/horses/${horseId}`)
  return {}
}

export async function deleteMyHorseHealthItem(
  horseId: string,
  itemId:  string,
): Promise<{ error?: string }> {
  const { supabase } = await assertAccess(horseId)

  const { error } = await supabase
    .from('health_program_item')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
  if (error) return { error: error.message }

  revalidatePath(`/my/horses/${horseId}`)
  return {}
}
