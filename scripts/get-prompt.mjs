import { supabaseAdmin } from './_env.mjs'
const s = supabaseAdmin()
const { data, error } = await s.from('import_prompt').select('slug, body').eq('slug', 'vet_record').single()
if (error) { console.error(error); process.exit(1) }
console.log(data.body)
