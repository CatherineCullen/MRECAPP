'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function addCarePlan(horseId: string, formData: FormData) {
  const user    = await getCurrentUser()
  const supabase = createAdminClient()

  const content  = (formData.get('content') as string).trim()
  const startsOn = (formData.get('starts_on') as string) || null
  const endsOn   = (formData.get('ends_on')   as string) || null

  if (!content) throw new Error('Content is required.')

  const { error } = await supabase
    .from('care_plan')
    .insert({
      horse_id:   horseId,
      content,
      starts_on:  startsOn,
      ends_on:    endsOn,
      created_by: user?.personId ?? null,
      is_active:  true,
      version:    1,
    })

  if (error) throw error

  redirect(`/chia/herd/horses/${horseId}`)
}

export async function resolveCarePlan(
  planId:  string,
  horseId: string,
  note:    string | null,
) {
  const user    = await getCurrentUser()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('care_plan')
    .update({
      is_active:       false,
      resolved_at:     new Date().toISOString(),
      resolved_by:     user?.personId ?? null,
      resolution_note: note?.trim() || null,
    })
    .eq('id', planId)

  if (error) throw error

  revalidatePath(`/chia/herd/horses/${horseId}`)
  revalidatePath('/chia/herd/care-plans')
}

/**
 * Edit = versioned supersession. We never UPDATE the content of an existing
 * plan — CLAUDE.md principle #7 says care plans are archived, not
 * overwritten. Instead we insert a new care_plan row with an incremented
 * `version`, `previous_version_id` pointing back, and deactivate the old
 * row (is_active=false). The old row's `resolved_at` stays null, which
 * distinguishes supersession from a deliberate Resolve.
 *
 * Refuses to edit plans that are already resolved (the "Resolve" action is
 * terminal) or already superseded (shouldn't happen through the UI, since
 * superseded rows aren't rendered as active, but defensive).
 */
export async function editCarePlan(args: {
  planId:    string
  horseId:   string
  content:   string
  starts_on: string | null
  ends_on:   string | null
}): Promise<{ newPlanId?: string; error?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  const content = args.content.trim()
  if (!content) return { error: 'Content is required.' }

  // Read current — need version, and sanity check it's still the live row.
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

  // Insert the new version. We carry forward source_vet_visit_id and
  // source_quote so import-provenance survives an edit (admin tidying up
  // AI-extracted wording shouldn't orphan the vet visit link).
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

  // Deactivate the old row — but do NOT set resolved_at. Supersession is
  // not the same thing as "the care plan was completed." If something later
  // needs to count "superseded" rows, the signal is (is_active=false AND
  // resolved_at IS NULL AND a child row has previous_version_id = this.id).
  const { error: updErr } = await supabase
    .from('care_plan')
    .update({
      is_active:  false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)

  if (updErr) return { error: updErr.message }

  revalidatePath(`/chia/herd/horses/${args.horseId}`)
  revalidatePath('/chia/herd/care-plans')
  return { newPlanId: inserted.id }
}
