// Dumps the active-people roster as JSON for pasting into a Cowork prompt
// (Visibook rider import dedupe). Writes to stdout.
//
// Run: node app/scripts/dump-people-for-dedupe.mjs > people.json

import { supabaseAdmin } from './_env.mjs'
const supabase = supabaseAdmin()

const { data, error } = await supabase
  .from('person')
  .select('id, first_name, last_name, preferred_name, email, phone, is_minor, is_organization, organization_name')
  .is('deleted_at', null)
  .order('last_name', { ascending: true })
  .order('first_name', { ascending: true })

if (error) { console.error(error); process.exit(1) }

const rows = data.map(p => ({
  id:             p.id,
  first_name:     p.first_name,
  last_name:      p.last_name,
  preferred_name: p.preferred_name || undefined,
  email:          p.email          || undefined,
  phone:          p.phone          || undefined,
  is_minor:       p.is_minor || undefined,
  organization:   p.is_organization ? p.organization_name : undefined,
}))

console.log(JSON.stringify(rows, null, 2))
console.error(`\n${rows.length} people dumped.`)
