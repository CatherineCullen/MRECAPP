// Legacy Visibook rider + lesson import.
//
// Reads lessonimportfromvisibook04222026.txt (concatenated Cowork JSON chunks),
// resolves each rider + instructor against the real people roster, and creates:
//   - people (for unmatched riders)
//   - lessons  (one per appointment; lesson_type='private')
//   - lesson_riders (with null subscription_id + null package_id — legacy)
//
// Nothing bills. lesson.notes='legacy_visibook_import' tags every row so you can
// bulk-find (or bulk-delete) later.
//
// Usage:
//   node app/scripts/import-visibook-lessons.mjs              # DRY RUN (default)
//   node app/scripts/import-visibook-lessons.mjs --commit     # actually write

import fs from 'node:fs'
import path from 'node:path'
import { supabaseAdmin } from './_env.mjs'

const COMMIT = process.argv.includes('--commit')
const IMPORT_TAG = 'legacy_visibook_import'
const IMPORT_FILE = path.resolve(
  process.cwd(),
  'lessonimportfromvisibook04222026.txt',
)

const supabase = supabaseAdmin()

// ---- Parse concatenated JSON chunks ---------------------------------------

function parseFile(raw) {
  const objects = []
  let i = 0
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++
    if (i >= raw.length) break
    if (raw[i] !== '{') { i++; continue }
    let depth = 0, inStr = false, esc = false
    const start = i
    for (; i < raw.length; i++) {
      const c = raw[i]
      if (esc) { esc = false; continue }
      if (inStr) {
        if (c === '\\') { esc = true; continue }
        if (c === '"') { inStr = false; continue }
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) { objects.push(raw.slice(start, i + 1)); i++; break }
      }
    }
  }
  const riders = []
  for (const s of objects) {
    const o = JSON.parse(s)
    if (Array.isArray(o.riders)) riders.push(...o.riders)
    else if (o.source_name) riders.push(o)
  }
  // Dedupe by source_name (last wins; chunks shouldn't overlap)
  const bySrc = new Map()
  for (const r of riders) bySrc.set(r.source_name, r)
  return [...bySrc.values()]
}

// ---- Resolvers ------------------------------------------------------------

function normName(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}
function normEmail(s) {
  return (s || '').trim().toLowerCase()
}

function buildIndex(people) {
  const byId = new Map()
  const byEmail = new Map()
  const byFullName = new Map()          // "first last" -> [people]
  for (const p of people) {
    byId.set(p.id, p)
    if (p.email) {
      const e = normEmail(p.email)
      if (!byEmail.has(e)) byEmail.set(e, [])
      byEmail.get(e).push(p)
    }
    const full = normName(`${p.first_name ?? ''} ${p.last_name ?? ''}`)
    if (full.trim()) {
      if (!byFullName.has(full)) byFullName.set(full, [])
      byFullName.get(full).push(p)
    }
  }
  return { byId, byEmail, byFullName }
}

// Priority: exact name match > email match > fuzzy-ish name match > null
function resolveRider(rider, idx) {
  const full = normName(`${rider.first_name} ${rider.last_name}`)
  if (idx.byFullName.has(full) && idx.byFullName.get(full).length === 1) {
    return { person: idx.byFullName.get(full)[0], reason: 'name' }
  }
  const email = normEmail(rider.email)
  if (email && idx.byEmail.has(email) && idx.byEmail.get(email).length === 1) {
    const p = idx.byEmail.get(email)[0]
    const pFull = normName(`${p.first_name} ${p.last_name}`)
    if (pFull === full) return { person: p, reason: 'email+name' }
    // Email belongs to a different person (likely a guardian).
    return { person: null, reason: `email matches ${p.first_name} ${p.last_name} (different person; likely guardian) — will create new` }
  }
  return { person: null, reason: 'no match; will create new' }
}

function resolveInstructor(raw, idx) {
  const full = normName(raw)
  if (idx.byFullName.has(full) && idx.byFullName.get(full).length === 1) {
    return idx.byFullName.get(full)[0]
  }
  // Try loose: strip middle/extra whitespace, case
  for (const [k, vs] of idx.byFullName) {
    if (vs.length === 1 && k.replace(/\s+/g, ' ') === full) return vs[0]
  }
  return null
}

// ---- Main -----------------------------------------------------------------

async function main() {
  console.log(`Mode: ${COMMIT ? 'COMMIT (writing!)' : 'dry run'}`)
  console.log(`Source: ${IMPORT_FILE}\n`)

  const raw = fs.readFileSync(IMPORT_FILE, 'utf8')
  const riders = parseFile(raw)
  console.log(`Parsed ${riders.length} riders.`)

  const { data: people, error: peopleErr } = await supabase
    .from('person')
    .select('id, first_name, last_name, preferred_name, email, phone, is_minor')
    .is('deleted_at', null)
  if (peopleErr) { console.error(peopleErr); process.exit(1) }
  const idx = buildIndex(people)
  console.log(`Loaded ${people.length} existing people.\n`)

  const CATHERINE_ID = 'faf14e5d-53b6-4b1c-9b4a-479eba3ddd39' // import actor

  // Stats
  let lessonsPlanned = 0, lessonsSkipped = 0
  const peopleToCreate = []
  const unresolvedInstructors = []
  const skipLog = []
  const resolutions = []

  // Pass 1: resolve all riders
  for (const r of riders) {
    const res = resolveRider(r, idx)
    resolutions.push({ source_name: r.source_name, personId: res.person?.id ?? null, reason: res.reason })
    if (!res.person) {
      // Parse preferred name from parenthetical or quoted nicknames like
      //   Danielle "Olivia" Gaither  or  Pamela (Ali) Jackson
      const m = r.source_name.match(/[("]([^)"]+)[)"]/)
      const preferred = m
        ? m[1].trim().replace(/\b\w/g, c => c.toUpperCase())
        : null
      peopleToCreate.push({
        source_name: r.source_name,
        payload: {
          first_name: r.first_name,
          last_name:  r.last_name,
          preferred_name: preferred,
          email: r.email || null,
          phone: r.phone || null,
        },
      })
    }
  }

  console.log('=== Rider resolution ===')
  for (const r of resolutions) {
    const mark = r.personId ? '✓' : '+'
    console.log(`  ${mark} ${r.source_name.padEnd(28)} ${r.personId ?? '(new)'} — ${r.reason}`)
  }
  console.log(`\nWill create ${peopleToCreate.length} new people.`)

  // Pass 2: create new people (if committing)
  const nameToId = new Map()
  for (const r of riders) {
    const res = resolveRider(r, idx)
    if (res.person) nameToId.set(r.source_name, res.person.id)
  }
  if (COMMIT && peopleToCreate.length) {
    const { data: inserted, error } = await supabase
      .from('person')
      .insert(peopleToCreate.map(p => p.payload))
      .select('id, first_name, last_name')
    if (error) { console.error('Create-people error:', error); process.exit(1) }
    for (let i = 0; i < peopleToCreate.length; i++) {
      nameToId.set(peopleToCreate[i].source_name, inserted[i].id)
    }
    console.log(`Created ${inserted.length} new people.`)
  } else if (peopleToCreate.length) {
    // Placeholder IDs so dry-run can continue
    for (const p of peopleToCreate) nameToId.set(p.source_name, `(would-create:${p.source_name})`)
  }

  // Pass 3: build lesson + lesson_rider rows
  const lessonInserts = []   // [{ rider_source_name, payload }]
  for (const r of riders) {
    const riderId = nameToId.get(r.source_name)
    for (const a of r.appointments || []) {
      const t = a.scheduled_at.slice(11, 16)
      if (t === '00:00') {
        lessonsSkipped++
        skipLog.push({ rider: r.source_name, at: a.scheduled_at, reason: 'missing time (00:00 placeholder)' })
        continue
      }
      // Resolve instructor. Trust provided id if it matches a real person; else look up by name.
      let instructorId = a.instructor_id && idx.byId.has(a.instructor_id) ? a.instructor_id : null
      if (!instructorId) {
        const inst = resolveInstructor(a.instructor_raw, idx)
        if (inst) instructorId = inst.id
      }
      if (!instructorId) {
        unresolvedInstructors.push({ rider: r.source_name, raw: a.instructor_raw, at: a.scheduled_at })
        lessonsSkipped++
        continue
      }
      lessonInserts.push({
        rider_source_name: r.source_name,
        riderId,
        instructorId,
        scheduled_at: a.scheduled_at,
      })
      lessonsPlanned++
    }
  }

  console.log(`\n=== Lessons ===`)
  console.log(`Planned: ${lessonsPlanned}   Skipped: ${lessonsSkipped}`)
  if (skipLog.length) {
    console.log(`\nMissing-time skips (fix in Visibook, re-run):`)
    const byRider = {}
    for (const s of skipLog) byRider[s.rider] = (byRider[s.rider] ?? 0) + 1
    for (const [k, v] of Object.entries(byRider)) console.log(`  ${k}: ${v}`)
  }
  if (unresolvedInstructors.length) {
    console.log(`\nUnresolved instructors (skipped — grant the role first):`)
    const raws = new Set(unresolvedInstructors.map(u => u.raw))
    for (const r of raws) console.log(`  "${r}" (${unresolvedInstructors.filter(u => u.raw === r).length} appts)`)
  }

  if (!COMMIT) {
    console.log(`\nDry run complete. Re-run with --commit to write.`)
    return
  }

  // Pass 4a: one legacy lesson_package per rider (Extra Lesson, price 0, no
  // invoice). Every legacy lesson_rider points at the rider's own package.
  // Matches the billing model — "extra lessons already paid in the old system."
  // Also grants the 'rider' role the same way subscriptions/new/actions.ts
  // does — the normal flows auto-grant; direct inserts have to DIY it.
  const apptsByRider = new Map()       // riderId -> count
  for (const L of lessonInserts) {
    apptsByRider.set(L.riderId, (apptsByRider.get(L.riderId) ?? 0) + 1)
  }
  for (const riderId of apptsByRider.keys()) {
    const { data: existing } = await supabase
      .from('person_role')
      .select('id, deleted_at')
      .eq('person_id', riderId)
      .eq('role', 'rider')
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!existing) {
      await supabase.from('person_role').insert({ person_id: riderId, role: 'rider' })
    } else if (existing.deleted_at) {
      await supabase
        .from('person_role')
        .update({ deleted_at: null, assigned_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  const pkgByRider = new Map()         // riderId -> package_id
  for (const [riderId, count] of apptsByRider) {
    const { data: pkg, error: pErr } = await supabase
      .from('lesson_package')
      .insert({
        person_id:              riderId,
        billed_to_id:           riderId,
        product_type:           'Extra Lesson',
        package_size:           count,
        package_price:          0,
        purchased_at:           today,
        invoice_id:             null,
        // Already paid in Visibook — don't queue for CHIA invoicing.
        billing_skipped_at:     new Date().toISOString(),
        billing_skipped_reason: 'Paid in Visibook before migration to CHIA',
        notes:                  IMPORT_TAG,
        created_by:             CATHERINE_ID,
      })
      .select('id')
      .single()
    if (pErr) { console.error('Package insert failed:', riderId, pErr); process.exit(1) }
    pkgByRider.set(riderId, pkg.id)
  }
  console.log(`Created ${pkgByRider.size} legacy lesson_packages.`)

  // Pass 4b: create lessons + lesson_riders
  let created = 0
  for (const L of lessonInserts) {
    const { data: lesson, error: lErr } = await supabase
      .from('lesson')
      .insert({
        instructor_id: L.instructorId,
        lesson_type:   'private',
        scheduled_at:  L.scheduled_at,
        status:        'scheduled',
        created_by:    CATHERINE_ID,
        notes:         IMPORT_TAG,
      })
      .select('id')
      .single()
    if (lErr) { console.error('Lesson insert failed:', L, lErr); process.exit(1) }

    const { error: rErr } = await supabase
      .from('lesson_rider')
      .insert({
        lesson_id:       lesson.id,
        rider_id:        L.riderId,
        subscription_id: null,
        package_id:      pkgByRider.get(L.riderId),
      })
    if (rErr) { console.error('Rider insert failed:', L, rErr); process.exit(1) }

    created++
    if (created % 25 === 0) console.log(`  ${created}/${lessonInserts.length}`)
  }
  console.log(`\nCreated ${created} lessons (+ lesson_riders). Tag: notes='${IMPORT_TAG}'`)
}

main().catch(e => { console.error(e); process.exit(1) })
