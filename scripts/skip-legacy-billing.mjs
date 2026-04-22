// Mark all legacy Visibook lesson_packages as billing-skipped.
// These were paid in the old system and will never be invoiced in CHIA.
// Effect: the lessons-events grid stops flagging their lessons as "pending."
import { supabaseAdmin } from './_env.mjs'
const s = supabaseAdmin()
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
