// One-off diagnostic for the provider QR picker duplicate bug.
//
// Checks two hypotheses:
//   (1) Someone has >1 person_role row with role='service_provider' — which
//       would require one deleted + one active (partial unique index allows
//       that). This is the cause of the React duplicate-key warning.
//   (2) Two distinct person records share the same first+last name — which
//       would render as visual duplicates in the picker but not trigger a
//       key warning.

import { supabaseAdmin } from './_env.mjs'

const db = supabaseAdmin()

console.log('\n=== (1) Multiple service_provider role rows per person ===\n')

const { data: roles, error: rolesErr } = await db
  .from('person_role')
  .select('person_id, role, deleted_at, assigned_at')
  .eq('role', 'service_provider')

if (rolesErr) { console.error(rolesErr); process.exit(1) }

const byPerson = new Map()
for (const r of roles ?? []) {
  if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, [])
  byPerson.get(r.person_id).push(r)
}

const dupeIds = [...byPerson.entries()].filter(([, rows]) => rows.length > 1)
if (dupeIds.length === 0) {
  console.log('  None. (No person has >1 service_provider grant.)')
} else {
  const ids = dupeIds.map(([id]) => id)
  const { data: ppl } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name')
    .in('id', ids)
  const nameById = new Map((ppl ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]))
  for (const [pid, rows] of dupeIds) {
    console.log(`  ${nameById.get(pid) ?? pid}  (${rows.length} rows)`)
    for (const r of rows) {
      console.log(`    assigned_at=${r.assigned_at}  deleted_at=${r.deleted_at ?? 'NULL (active)'}`)
    }
  }
}

console.log('\n=== (2) Multiple person records with the same name ===\n')

const { data: serviceProviders } = await db
  .from('person_role')
  .select(`
    person:person!person_role_person_id_fkey ( id, first_name, last_name, preferred_name, deleted_at )
  `)
  .eq('role', 'service_provider')
  .is('deleted_at', null)

const byName = new Map()
for (const row of serviceProviders ?? []) {
  const p = row.person
  if (!p || p.deleted_at) continue
  const key = `${(p.first_name ?? '').trim().toLowerCase()}|${(p.last_name ?? '').trim().toLowerCase()}`
  if (!byName.has(key)) byName.set(key, [])
  byName.get(key).push(p)
}

const nameDupes = [...byName.entries()].filter(([, arr]) => arr.length > 1)
if (nameDupes.length === 0) {
  console.log('  None. (Every service provider has a unique first+last name.)')
} else {
  for (const [, arr] of nameDupes) {
    console.log(`  "${arr[0].first_name} ${arr[0].last_name}" appears ${arr.length} times:`)
    for (const p of arr) {
      console.log(`    id=${p.id}  preferred_name=${p.preferred_name ?? '—'}`)
    }
  }
}

console.log()
