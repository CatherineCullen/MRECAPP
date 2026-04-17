import { createAdminClient } from './supabase/admin'

/**
 * Derive the `boarder` person_role from horse_contact state.
 *
 * Rule (from Catherine):
 *   "Everyone with a horse contact is a Boarder."
 *
 * More precisely: anyone with an active horse_contact whose role is an
 * ownership-level label (Owner / Co-Owner / Lessee) gets the boarder role.
 * Vet, farrier, guardian, trainer connections do NOT grant boarder status —
 * those people interact with a horse but don't board one.
 *
 * Safe to call multiple times (idempotent). Call after any change to
 * horse_contact (insert, soft-delete, role edit).
 */
const OWNERSHIP_ROLES = new Set([
  'owner', 'co-owner', 'co_owner', 'coowner', 'lessee', 'lessor',
])

function isOwnershipRole(raw: string | null | undefined): boolean {
  if (!raw) return false
  return OWNERSHIP_ROLES.has(raw.toLowerCase().trim().replace(/\s+/g, '-'))
}

export async function syncBoarderRole(personId: string): Promise<void> {
  const supabase = createAdminClient()

  // 1) Gather this person's active horse contacts — do any confer boarder status?
  const { data: contacts } = await supabase
    .from('horse_contact')
    .select('role')
    .eq('person_id', personId)
    .is('deleted_at', null)

  const shouldBeBoarder = (contacts ?? []).some(c => isOwnershipRole(c.role))

  // 2) Find the most recent person_role row for this person + 'boarder'
  //    (there may be historical soft-deleted ones).
  const { data: rows } = await supabase
    .from('person_role')
    .select('id, deleted_at, assigned_at')
    .eq('person_id', personId)
    .eq('role', 'boarder' as any)
    .order('assigned_at', { ascending: false })

  const mostRecent = (rows ?? [])[0]
  const isCurrentlyActive = mostRecent && !mostRecent.deleted_at

  // 3) Reconcile
  if (shouldBeBoarder && !isCurrentlyActive) {
    if (mostRecent) {
      await supabase
        .from('person_role')
        .update({ deleted_at: null, assigned_at: new Date().toISOString() })
        .eq('id', mostRecent.id)
    } else {
      await supabase
        .from('person_role')
        .insert({ person_id: personId, role: 'boarder' as any })
    }
  } else if (!shouldBeBoarder && isCurrentlyActive) {
    await supabase
      .from('person_role')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mostRecent.id)
  }
}
