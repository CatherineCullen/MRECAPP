// Grant the 'rider' role to every person attached to a legacy Visibook
// lesson_package (notes='legacy_visibook_import'). The normal subscription +
// product flows auto-grant this role, but the direct import bypassed them.
// Idempotent — skips anyone who already has the role.
import { createClient } from '@supabase/supabase-js'
const s = createClient(
  'https://adtgvzxuvvbszcmhvgqs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkdGd2enh1dnZic3pjbWh2Z3FzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI5ODY1MCwiZXhwIjoyMDkxODc0NjUwfQ.qJqzPliQfo-sitJaQK5GObmOGQs2q08FvSW_dZVrpSA',
)

const { data: pkgs, error: pErr } = await s
  .from('lesson_package')
  .select('person_id')
  .eq('notes', 'legacy_visibook_import')
  .is('deleted_at', null)
if (pErr) { console.error(pErr); process.exit(1) }

const personIds = [...new Set((pkgs ?? []).map(p => p.person_id))]
console.log(`Legacy-import riders: ${personIds.length}`)

let inserted = 0, restored = 0, skipped = 0
for (const id of personIds) {
  const { data: existing } = await s
    .from('person_role')
    .select('id, deleted_at')
    .eq('person_id', id)
    .eq('role', 'rider')
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existing) {
    const { error } = await s.from('person_role').insert({ person_id: id, role: 'rider' })
    if (error) { console.error(id, error); process.exit(1) }
    inserted++
  } else if (existing.deleted_at) {
    const { error } = await s
      .from('person_role')
      .update({ deleted_at: null, assigned_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) { console.error(id, error); process.exit(1) }
    restored++
  } else {
    skipped++
  }
}
console.log(`Inserted: ${inserted}   Restored: ${restored}   Already had role: ${skipped}`)
