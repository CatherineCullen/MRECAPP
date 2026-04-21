import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The set of person IDs whose data the signed-in user should see in /my/.
 * That's the user themselves plus any minors they're the guardian of.
 *
 * Used for: lessons (rider_id), training rides via horse connections,
 * makeup tokens (rider_id), horse_contact (person_id), invoices (billed_to_id).
 * Minors typically don't have invoices of their own, but including them is
 * a no-op there and keeps every /my/ query consistent.
 */
export async function getRiderScope(personId: string): Promise<string[]> {
  const db = createAdminClient()
  const { data: minors } = await db
    .from('person')
    .select('id')
    .eq('guardian_id', personId)
    .eq('is_minor', true)
    .is('deleted_at', null)
  return [personId, ...(minors ?? []).map(m => m.id)]
}
