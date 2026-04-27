// Find files in the `documents` storage bucket that no longer have a
// corresponding `document` row (i.e., orphans).
//
// Written to clean up after the 2026-04-24 GDPR hard delete of Chartese/
// Amaris Torrence and Majesty — the document rows were deleted but the
// underlying PDFs in Storage weren't. Anything leftover from that delete
// (plus any older stale uploads from testing) will show up here.
//
// Usage:
//   node scripts/find-orphan-documents.mjs           # dry-run, prints orphans
//   node scripts/find-orphan-documents.mjs --delete  # actually deletes them

import { supabaseAdmin } from './_env.mjs'

const db     = supabaseAdmin()
const DELETE = process.argv.includes('--delete')

// Recursively list every file under the given prefix in the `documents` bucket.
async function listAll(prefix = '') {
  const out    = []
  const stack  = [prefix]
  while (stack.length) {
    const p = stack.pop()
    let offset = 0
    while (true) {
      const { data, error } = await db.storage.from('documents').list(p, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      if (!data || data.length === 0) break
      for (const entry of data) {
        const full = p ? `${p}/${entry.name}` : entry.name
        // Folders come back with id = null
        if (entry.id === null) stack.push(full)
        else out.push(full)
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }
  return out
}

console.log('Listing all files in documents bucket…')
const allFiles = await listAll()
console.log(`  found ${allFiles.length} files`)

console.log('Fetching live document.file_url values…')
const live = new Set()
let from = 0
while (true) {
  const { data, error } = await db
    .from('document')
    .select('file_url, signature_png_path')
    .is('deleted_at', null)
    .range(from, from + 999)
  if (error) throw error
  if (!data || data.length === 0) break
  for (const row of data) {
    if (row.file_url)            live.add(row.file_url)
    if (row.signature_png_path)  live.add(row.signature_png_path)
  }
  if (data.length < 1000) break
  from += 1000
}
console.log(`  found ${live.size} live documents`)

const orphans = allFiles.filter(f => !live.has(f))
console.log(`\n${orphans.length} orphan file(s):\n`)
for (const f of orphans) console.log('  ' + f)

if (!DELETE) {
  console.log('\nDry-run. Re-run with --delete to remove them.')
  process.exit(0)
}

if (orphans.length === 0) {
  console.log('\nNothing to delete.')
  process.exit(0)
}

console.log(`\nDeleting ${orphans.length} orphan(s)…`)
// Supabase remove() caps at 1000 per call — chunk just in case.
for (let i = 0; i < orphans.length; i += 1000) {
  const chunk = orphans.slice(i, i + 1000)
  const { error } = await db.storage.from('documents').remove(chunk)
  if (error) throw error
}
console.log('Done.')
