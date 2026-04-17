'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Server actions for the HealthItemType catalog, surfaced on the Herd Health
 * tab so admins manage the grid's columns from the grid itself (see ADR note
 * / D6). Soft-delete only — existing HealthEvent + HealthProgramItem rows
 * reference these types, so we never hard-delete.
 *
 * The vet-import prompt at /chia/herd/import reads the same catalog with
 * identical filters (is_active + deleted_at IS NULL), so any change here
 * propagates to the next-generated AI prompt automatically.
 */

export type HealthItemTypePatch = {
  id?:                     string
  name:                    string
  is_essential:            boolean
  show_in_herd_dashboard:  boolean
  default_interval_days:   number | null
  sort_order:              number
}

export async function upsertHealthItemType(p: HealthItemTypePatch): Promise<{ error?: string; id?: string }> {
  if (!p.name.trim()) return { error: 'Name is required' }

  const supabase = createAdminClient()
  const user     = await getCurrentUser()
  const now      = new Date().toISOString()

  if (p.id) {
    const { error } = await supabase
      .from('health_item_type')
      .update({
        name:                   p.name.trim(),
        is_essential:           p.is_essential,
        show_in_herd_dashboard: p.show_in_herd_dashboard,
        default_interval_days:  p.default_interval_days,
        sort_order:             p.sort_order,
        updated_at:             now,
      })
      .eq('id', p.id)
    if (error) return { error: error.message }
    revalidatePath('/chia/herd/health')
    return { id: p.id }
  }

  const { data, error } = await supabase
    .from('health_item_type')
    .insert({
      name:                   p.name.trim(),
      is_essential:           p.is_essential,
      show_in_herd_dashboard: p.show_in_herd_dashboard,
      default_interval_days:  p.default_interval_days,
      sort_order:             p.sort_order,
      is_active:              true,
      created_by:             user?.personId ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  revalidatePath('/chia/herd/health')
  return { id: data?.id }
}

export async function setHealthItemTypeActive(id: string, active: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('health_item_type')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/chia/herd/health')
  return {}
}

/**
 * Swap sort_order with the neighbour in the given direction. Simpler than
 * a full list reshuffle — the grid has ~10 columns, adjacent swap is plenty.
 * Only compares against other *active* rows so deactivated items don't leave
 * holes in the ordering.
 */
export async function moveHealthItemType(id: string, direction: 'up' | 'down'): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('health_item_type')
    .select('id, sort_order')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) return { error: error.message }

  const ordered = rows ?? []
  const i = ordered.findIndex(r => r.id === id)
  if (i === -1) return { error: 'Item not found' }

  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= ordered.length) return {}      // already at edge — no-op

  const a = ordered[i]
  const b = ordered[j]
  const now = new Date().toISOString()

  // Swap via a temporary value to avoid any (even imaginary) unique constraint
  // collisions on sort_order. Cheap, explicit, safe.
  await supabase.from('health_item_type').update({ sort_order: -1, updated_at: now }).eq('id', a.id)
  await supabase.from('health_item_type').update({ sort_order: a.sort_order, updated_at: now }).eq('id', b.id)
  await supabase.from('health_item_type').update({ sort_order: b.sort_order, updated_at: now }).eq('id', a.id)

  revalidatePath('/chia/herd/health')
  return {}
}
