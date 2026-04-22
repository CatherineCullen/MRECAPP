// One-shot: delete orphan legacy lesson from the first (failed) import attempt.
import { createClient } from '@supabase/supabase-js'
const s = createClient(
  'https://adtgvzxuvvbszcmhvgqs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkdGd2enh1dnZic3pjbWh2Z3FzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI5ODY1MCwiZXhwIjoyMDkxODc0NjUwfQ.qJqzPliQfo-sitJaQK5GObmOGQs2q08FvSW_dZVrpSA',
)
const { data: lessons } = await s.from('lesson').select('id').eq('notes', 'legacy_visibook_import')
console.log('Deleting', lessons?.length, 'legacy lessons')
for (const l of lessons ?? []) {
  await s.from('lesson_rider').delete().eq('lesson_id', l.id)
  const { error } = await s.from('lesson').delete().eq('id', l.id)
  if (error) console.error(error)
}
console.log('Done.')
