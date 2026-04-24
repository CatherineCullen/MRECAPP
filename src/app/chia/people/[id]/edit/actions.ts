'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function updatePerson(personId: string, formData: FormData) {
  const supabase = createAdminClient()
  const isOrg    = formData.get('is_organization') === 'on'
  const isMinor  = formData.get('is_minor') === 'on'

  // Email is a credential once a person has a login — protect it from being
  // edited via the generic person form. Admins use the explicit "Change login
  // email" flow instead (auth + person.email atomically). See
  // src/app/chia/people/[id]/_components/ChangeLoginEmailButton.tsx.
  const { data: existing } = await supabase
    .from('person')
    .select('auth_user_id, email')
    .eq('id', personId)
    .maybeSingle()
  const hasAccount = !!existing?.auth_user_id
  const submittedEmail = (formData.get('email') as string | null)?.trim() || null
  const safeEmail = hasAccount ? (existing?.email ?? null) : submittedEmail

  const { error } = await supabase
    .from('person')
    .update({
      first_name:               isOrg ? 'Org' : (formData.get('first_name') as string).trim(),
      last_name:                isOrg ? 'Org' : (formData.get('last_name') as string).trim(),
      preferred_name:           (formData.get('preferred_name') as string | null)?.trim() || null,
      email:                    safeEmail,
      phone:                    (formData.get('phone') as string | null)?.trim() || null,
      address:                  (formData.get('address') as string | null)?.trim() || null,
      date_of_birth:            (formData.get('date_of_birth') as string | null) || null,
      is_minor:                 isMinor,
      guardian_id:              isMinor ? ((formData.get('guardian_id') as string | null) || null) : null,
      is_organization:          isOrg,
      organization_name:        isOrg ? (formData.get('organization_name') as string).trim() : null,
      provider_type:            (formData.get('provider_type') as string | null)?.trim() || null,
      is_training_ride_provider: formData.get('is_training_ride_provider') === 'on',
      riding_level:             ((formData.get('riding_level') as string | null) || null) as any,
      weight_category:          ((formData.get('weight_category') as string | null) || null) as any,
      height:                   (formData.get('height') as string | null)?.trim() || null,
      usef_id:                  (formData.get('usef_id') as string | null)?.trim() || null,
      notes:                    (formData.get('notes') as string | null)?.trim() || null,
      preferred_language:       ((formData.get('preferred_language') as string | null) || 'english') as any,
    })
    .eq('id', personId)

  if (error) throw error

  // Sync roles by diff, not by blow-it-away-and-rebuild.
  //
  // The naïve "soft-delete all active, re-insert desired" approach churned a
  // person's role rows on every edit — even edits that didn't touch roles.
  // That left a growing trail of soft-deleted duplicates behind, which then
  // leaked into any query that forgot to filter `deleted_at IS NULL` (e.g.
  // the provider QR picker: see chia/boarding/qr-codes/page.tsx).
  //
  // Now: compute current active roles, desired roles, and only touch the
  // diff. Roles to remove → soft-delete. Roles to add → if there's a
  // pre-existing soft-deleted row for that (person, role) pair, resurrect
  // it (clear deleted_at); otherwise insert fresh. Unchanged roles are
  // left untouched — no churn, no new rows, no duplicate-key warnings.
  const desired = new Set(formData.getAll('roles') as string[])

  const { data: existingRoles } = await supabase
    .from('person_role')
    .select('id, role, deleted_at')
    .eq('person_id', personId)

  const active  = new Map<string, string>() // role -> id
  const deleted = new Map<string, string>() // role -> id (most recent)
  for (const r of existingRoles ?? []) {
    if (r.deleted_at === null) {
      active.set(r.role, r.id)
    } else {
      deleted.set(r.role, r.id)
    }
  }

  const nowIso = new Date().toISOString()

  // Remove: roles that are active but not desired.
  const toRemove = [...active.entries()]
    .filter(([role]) => !desired.has(role))
    .map(([, id]) => id)
  if (toRemove.length > 0) {
    await supabase
      .from('person_role')
      .update({ deleted_at: nowIso })
      .in('id', toRemove)
  }

  // Add: desired roles that aren't currently active.
  const toResurrect: string[] = []
  const toInsert:    string[] = []
  for (const role of desired) {
    if (active.has(role)) continue
    const resurrectId = deleted.get(role)
    if (resurrectId) toResurrect.push(resurrectId)
    else             toInsert.push(role)
  }
  if (toResurrect.length > 0) {
    await supabase
      .from('person_role')
      .update({ deleted_at: null, assigned_at: nowIso })
      .in('id', toResurrect)
  }
  if (toInsert.length > 0) {
    await supabase
      .from('person_role')
      .insert(toInsert.map(role => ({ person_id: personId, role: role as any })))
  }

  redirect(`/chia/people/${personId}`)
}
