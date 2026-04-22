// Follow-up import for the three Visibook riders whose times came back as
// 00:00 placeholders in the original Cowork extraction. Times transcribed
// manually from Visibook on 2026-04-22.
//
// Mirrors import-visibook-lessons.mjs: creates one billing-skipped
// lesson_package per rider + a lesson + lesson_rider per appointment,
// tagged notes='legacy_visibook_import'. Runs idempotently-ish — safe to
// re-run only if you've cleaned out the prior rows.
//
// Usage: node app/scripts/import-visibook-missing-times.mjs         (dry run)
//        node app/scripts/import-visibook-missing-times.mjs --commit

import { supabaseAdmin } from './_env.mjs'

const COMMIT = process.argv.includes('--commit')
const IMPORT_TAG = 'legacy_visibook_import'
const CATHERINE_ID = 'faf14e5d-53b6-4b1c-9b4a-479eba3ddd39'

const supabase = supabaseAdmin()

// ---- Data -----------------------------------------------------------------

// Visibook appointment date+time strings; local tz is America/New_York (EDT in
// this window = -04:00). Stored as local ISO with explicit -04:00 so the
// database value matches wall-clock time.
const TZ = '-04:00'
function at(month, day, year, hhmm) {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}T${hhmm}:00${TZ}`
}

const plan = [
  {
    rider: 'Beverly Elise Keith',
    appts: [
      { at: at(4, 22, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(4, 24, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(4, 29, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(5,  1, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(5,  6, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(5,  8, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(5, 13, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(5, 15, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(5, 20, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(5, 22, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(5, 27, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(5, 29, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(6,  3, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(6,  5, 2026, '15:30'), instructor: 'Paul Turner' },
      { at: at(6, 10, 2026, '17:30'), instructor: 'Paul Turner' },
      { at: at(6, 12, 2026, '15:30'), instructor: 'Paul Turner' },
    ],
  },
  {
    rider: 'Cameron Fabio',
    appts: [
      { at: at(4, 26, 2026, '12:45'), instructor: 'Rosslyn Joholski' },
      { at: at(5,  3, 2026, '12:45'), instructor: 'Rosslyn Joholski' },
      { at: at(5, 16, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(5, 23, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(5, 30, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(6,  6, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(6, 13, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(6, 20, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(6, 27, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(7,  4, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(7, 11, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(7, 18, 2026, '14:30'), instructor: 'Rosslyn Joholski' },
      { at: at(8,  1, 2026, '15:00'), instructor: 'Rosslyn Joholski' },
      { at: at(8,  8, 2026, '15:00'), instructor: 'Brianna Holmes' },
    ],
  },
  {
    rider: 'Logan Fabio',
    appts: [
      { at: at(4, 25, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(5,  2, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(5,  9, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(5, 16, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(5, 23, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(5, 30, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(6,  6, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(6, 13, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(6, 20, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(6, 27, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(7,  4, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(7, 11, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(7, 18, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(8,  1, 2026, '15:00'), instructor: 'Brianna Holmes' },
      { at: at(8,  8, 2026, '15:00'), instructor: 'Rosslyn Joholski' },
    ],
  },
]

// ---- Resolve ---------------------------------------------------------------

function normName(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function main() {
  console.log(`Mode: ${COMMIT ? 'COMMIT (writing!)' : 'dry run'}\n`)

  const { data: people, error } = await supabase
    .from('person')
    .select('id, first_name, last_name')
    .is('deleted_at', null)
  if (error) { console.error(error); process.exit(1) }

  const byName = new Map()
  for (const p of people) {
    const k = normName(`${p.first_name} ${p.last_name}`)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(p)
  }
  const resolve = (name) => {
    const arr = byName.get(normName(name))
    return arr && arr.length === 1 ? arr[0] : null
  }

  // Resolve everyone up front so we fail loud before touching the DB.
  const resolved = []
  for (const group of plan) {
    const rider = resolve(group.rider)
    if (!rider) { console.error(`Could not resolve rider: ${group.rider}`); process.exit(1) }
    const appts = []
    for (const a of group.appts) {
      const ins = resolve(a.instructor)
      if (!ins) { console.error(`Could not resolve instructor: ${a.instructor}`); process.exit(1) }
      appts.push({ at: a.at, instructorId: ins.id, instructorName: a.instructor })
    }
    resolved.push({ riderName: group.rider, riderId: rider.id, appts })
  }

  console.log('=== Plan ===')
  for (const g of resolved) {
    console.log(`  ${g.riderName.padEnd(22)} (${g.riderId})  ${g.appts.length} appts`)
    for (const a of g.appts) {
      console.log(`    ${a.at}   ${a.instructorName}`)
    }
  }
  const total = resolved.reduce((n, g) => n + g.appts.length, 0)
  console.log(`\nTotal: ${total} lessons across ${resolved.length} riders`)

  if (!COMMIT) {
    console.log('\nDry run complete. Re-run with --commit to write.')
    return
  }

  // Write — one billing-skipped package per rider, then lessons + lesson_riders.
  // Also grant the 'rider' role (parity with subscriptions/new/actions.ts).
  const today = new Date().toISOString().slice(0, 10)
  let lessonsCreated = 0
  for (const g of resolved) {
    const { data: existingRole } = await supabase
      .from('person_role')
      .select('id, deleted_at')
      .eq('person_id', g.riderId)
      .eq('role', 'rider')
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!existingRole) {
      await supabase.from('person_role').insert({ person_id: g.riderId, role: 'rider' })
    } else if (existingRole.deleted_at) {
      await supabase
        .from('person_role')
        .update({ deleted_at: null, assigned_at: new Date().toISOString() })
        .eq('id', existingRole.id)
    }

    const { data: pkg, error: pErr } = await supabase
      .from('lesson_package')
      .insert({
        person_id:              g.riderId,
        billed_to_id:           g.riderId,
        product_type:           'Extra Lesson',
        package_size:           g.appts.length,
        package_price:          0,
        purchased_at:           today,
        invoice_id:             null,
        billing_skipped_at:     new Date().toISOString(),
        billing_skipped_reason: 'Paid in Visibook before migration to CHIA',
        notes:                  IMPORT_TAG,
        created_by:             CATHERINE_ID,
      })
      .select('id')
      .single()
    if (pErr) { console.error('Package insert failed:', g.riderName, pErr); process.exit(1) }

    for (const a of g.appts) {
      const { data: lesson, error: lErr } = await supabase
        .from('lesson')
        .insert({
          instructor_id: a.instructorId,
          lesson_type:   'private',
          scheduled_at:  a.at,
          status:        'scheduled',
          created_by:    CATHERINE_ID,
          notes:         IMPORT_TAG,
        })
        .select('id')
        .single()
      if (lErr) { console.error('Lesson insert failed:', g.riderName, a, lErr); process.exit(1) }

      const { error: rErr } = await supabase
        .from('lesson_rider')
        .insert({
          lesson_id:       lesson.id,
          rider_id:        g.riderId,
          subscription_id: null,
          package_id:      pkg.id,
        })
      if (rErr) { console.error('Rider insert failed:', g.riderName, a, rErr); process.exit(1) }
      lessonsCreated++
    }
    console.log(`  ${g.riderName}: +${g.appts.length}`)
  }
  console.log(`\nCreated ${lessonsCreated} lessons across ${resolved.length} packages.`)
}

main().catch(e => { console.error(e); process.exit(1) })
