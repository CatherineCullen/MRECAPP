// Mark all legacy Visibook lesson_packages as billing-skipped.
// These were paid in the old system and will never be invoiced in CHIA.
// Effect: the lessons-events grid stops flagging their lessons as "pending."
import { createClient } from '@supabase/supabase-js'
const s = createClient(
  'https://adtgvzxuvvbszcmhvgqs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkdGd2enh1dnZic3pjbWh2Z3FzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI5ODY1MCwiZXhwIjoyMDkxODc0NjUwfQ.qJqzPliQfo-sitJaQK5GObmOGQs2q08FvSW_dZVrpSA',
)
const { data, error } = await s
  .from('lesson_package')
  .update({
    billing_skipped_at:     new Date().toISOString(),
    billing_skipped_reason: 'Paid in Visibook before migration to CHIA',
  })
  .eq('notes', 'legacy_visibook_import')
  .is('billing_skipped_at', null)
  .select('id')
if (error) { console.error(error); process.exit(1) }
console.log(`Marked ${data.length} legacy packages billing-skipped.`)
