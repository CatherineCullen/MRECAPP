// One-shot: delete orphan legacy lesson from the first (failed) import attempt.
import { supabaseAdmin } from './_env.mjs'
const s = supabaseAdmin()
const { data: lessons } = await s.from('lesson').select('id').eq('notes', 'legacy_visibook_import')
console.log('Deleting', lessons?.length, 'legacy lessons')
for (const l of lessons ?? []) {
  await s.from('lesson_rider').delete().eq('lesson_id', l.id)
  const { error } = await s.from('lesson').delete().eq('id', l.id)
  if (error) console.error(error)
}
console.log('Done.')
