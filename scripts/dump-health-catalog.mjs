import { supabaseAdmin } from './_env.mjs'
const s = supabaseAdmin()
const { data, error } = await s.from('health_item_type')
  .select('id, name, is_active, is_essential, deleted_at, created_at')
  .order('name')
if (error) { console.error(error); process.exit(1) }
for (const r of data) {
  console.log(`${r.is_active ? 'A' : 'I'}${r.deleted_at ? 'D' : ' '} ${r.is_essential ? 'E' : ' '}  ${r.name.padEnd(40)} ${r.id}`)
}
console.log(`\n${data.length} rows total`)
