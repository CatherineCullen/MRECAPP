import { supabaseAdmin } from './_env.mjs'
const s = supabaseAdmin()
const name = process.argv[2] ?? 'Bear'
const { data: horses } = await s.from('horse').select('id, barn_name').ilike('barn_name', `%${name}%`).is('deleted_at', null)
for (const h of horses ?? []) {
  console.log(`\n=== ${h.barn_name} (${h.id}) ===`)
  const { data: items } = await s.from('health_program_item')
    .select('id, last_done, next_due, deleted_at, type:health_item_type!health_item_type_id(name, is_active, deleted_at)')
    .eq('horse_id', h.id)
  for (const i of items ?? []) {
    console.log(`  ${i.deleted_at ? 'DEL' : '   '}  ${i.type?.name?.padEnd(40)} last=${i.last_done ?? '—'}  next=${i.next_due ?? '—'}  typeActive=${i.type?.is_active}`)
  }
}
