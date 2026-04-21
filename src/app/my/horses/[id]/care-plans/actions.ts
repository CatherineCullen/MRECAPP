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

export async function addMyCarePlan(args: {
  horseId:   string
  content:   string
  starts_on: string | null
  ends_on:   string | null
}): Promise<{ error?: string }> {
  const content = args.content.trim()
  if (!content) return { error: 'Content is required.' }

  const { user, supabase } = await assertAccess(args.horseId)

  const { error } = await supabase
    .from('care_plan')
    .insert({
      horse_id:   args.horseId,
      content,
      starts_on:  args.starts_on,
      ends_on:    args.ends_on,
      created_by: user?.personId ?? null,
      is_active:  true,
      version:    1,
    })

  if (error) return { error: error.message }

  revalidatePath(`/my/horses/${args.horseId}`)
  return {}
}

export async function resolveMyCarePlan(args: {
  planId:  string
  horseId: string
  note:    string | null
}): Promise<{ error?: string }> {
  const { user, supabase } = await assertAccess(args.horseId)

  const { error } = await supabase
    .from('care_plan')
    .update({
      is_active:       false,
      resolved_at:     new Date().toISOString(),
      resolved_by:     user?.personId ?? null,
      resolution_note: args.note?.trim() || null,
    })
    .eq('id', args.planId)
    .eq('horse_id', args.horseId)

  if (error) return { error: error.message }

  revalidatePath(`/my/horses/${args.horseId}`)
  return {}
}

// Edit = versioned supersession (see CLAUDE.md principle #7; care plans
// are archived, not overwritten). Mirrors the CHIA editCarePlan action.
export async function editMyCarePlan(args: {
  planId:    string
  horseId:   string
  content:   string
  starts_on: string | null
  ends_on:   string | null
}): Promise<{ newPlanId?: string; error?: string }> {
  const content = args.content.trim()
  if (!content) return { error: 'Content is required.' }

  const { user, supabase } = await assertAccess(args.horseId)

  const { data: current, error: readErr } = await supabase
    .from('care_plan')
    .select('id, horse_id, version, is_active, resolved_at, source_vet_visit_id, source_quote')
    .eq('id', args.planId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!current) return { error: 'Plan not found.' }
  if (current.horse_id !== args.horseId) return { error: 'Horse mismatch.' }
  if (current.resolved_at) return { error: 'This plan is already resolved — create a new one instead of editing.' }
  if (!current.is_active)  return { error: 'This plan has been superseded by a newer version.' }

  const { data: inserted, error: insErr } = await supabase
    .from('care_plan')
    .insert({
      horse_id:            args.horseId,
      content,
      starts_on:           args.starts_on,
      ends_on:             args.ends_on,
      version:             (current.version ?? 1) + 1,
      previous_version_id: current.id,
      source_vet_visit_id: current.source_vet_visit_id ?? null,
      source_quote:        current.source_quote ?? null,
      created_by:          user?.personId ?? null,
      is_active:           true,
    })
    .select('id')
    .single()

  if (insErr || !inserted) return { error: insErr?.message ?? 'Failed to save changes.' }

  const { error: updErr } = await supabase
    .from('care_plan')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', current.id)

  if (updErr) return { error: updErr.message }

  revalidatePath(`/my/horses/${args.horseId}`)
  return { newPlanId: inserted.id }
}
