// One-off: compact the trail of soft-deleted person_role rows left by the
// old "delete all, re-insert" edit action.
//
// For each (person_id, role) pair that has BOTH an active row AND one or
// more soft-deleted rows, hard-delete the soft-deleted ones. The active row
// is the current truth; the deleted rows are vestigial churn.
//
// Run once after deploying the diff-based edit fix, then delete this script.

import { supabaseAdmin } from './_env.mjs'

const db = supabaseAdmin()

const { data: all, error } = await db
  .from('person_role')
  .select('id, person_id, role, deleted_at')

if (error) { console.error(error); process.exit(1) }

// Group by (person_id, role)
const groups = new Map()
for (const r of all ?? []) {
  const k = `${r.person_id}|${r.role}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

const idsToHardDelete = []
let pairsAffected = 0
for (const rows of groups.values()) {
  const hasActive = rows.some(r => r.deleted_at === null)
  if (!hasActive) continue // leave lone deleted rows alone — they're history for roles that were actually removed
  const deletedRows = rows.filter(r => r.deleted_at !== null)
  if (deletedRows.length === 0) continue
  pairsAffected++
  for (const r of deletedRows) idsToHardDelete.push(r.id)
}

console.log(`\nFound ${idsToHardDelete.length} stale person_role rows across ${pairsAffected} (person, role) pairs with an active grant.`)

if (idsToHardDelete.length === 0) {
  console.log('Nothing to do.\n')
  process.exit(0)
}

// Chunk because .in() has query-size limits
const CHUNK = 200
for (let i = 0; i < idsToHardDelete.length; i += CHUNK) {
  const slice = idsToHardDelete.slice(i, i + CHUNK)
  const { error: delErr } = await db.from('person_role').delete().in('id', slice)
  if (delErr) { console.error(delErr); process.exit(1) }
  console.log(`  deleted ${Math.min(i + CHUNK, idsToHardDelete.length)} / ${idsToHardDelete.length}`)
}

console.log('\nDone.\n')
