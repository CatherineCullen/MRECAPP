// One-off: ensure a Waiver document exists for catherine.cullen@gmail.com
// so her test rider account can be invoiced/scheduled without the waiver
// gate flipping lessons to "pending — no waiver." She has a real waiver
// on file in the office; this just records that fact in the system.
//
// Idempotent: if a waiver document already exists for this person, the
// script is a no-op.
//
// Run from app/: node scripts/seed-test-waiver.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Tiny .env.local reader — avoids pulling in dotenv just for one script.
function loadEnvLocal() {
  try {
    const txt = readFileSync('.env.local', 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      const [, k, raw] = m
      if (process.env[k]) continue
      const v = raw.replace(/^["']|["']$/g, '')
      process.env[k] = v
    }
  } catch {}
}
loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const TARGET_EMAIL = 'catherine.cullen@gmail.com'

const db = createClient(url, key)

const { data: person, error: personErr } = await db
  .from('person')
  .select('id, first_name, last_name')
  .eq('email', TARGET_EMAIL)
  .maybeSingle()

if (personErr || !person) {
  console.error(`Person ${TARGET_EMAIL} not found:`, personErr?.message ?? 'no row')
  process.exit(1)
}

console.log(`Found person ${person.first_name} ${person.last_name} (${person.id})`)

// Idempotency check.
const { data: existing } = await db
  .from('document')
  .select('id, filename, signed_at')
  .eq('person_id', person.id)
  .eq('document_type', 'Waiver')
  .is('deleted_at', null)
  .limit(1)

if (existing && existing.length > 0) {
  console.log(`Waiver already exists (id=${existing[0].id}, filename=${existing[0].filename}). No-op.`)
  process.exit(0)
}

const now = new Date().toISOString()
const { data: inserted, error: insertErr } = await db
  .from('document')
  .insert({
    person_id:          person.id,
    document_type:      'Waiver',
    filename:           'admin-seeded-waiver.txt',
    file_url:           'admin-seed://catherine.cullen@gmail.com',
    notes:              'Admin-seeded placeholder. Real signed waiver on file in the office; bypassed during testing because account creation flow not live yet.',
    submitted_by_owner: false,
    signed_at:          now,
    uploaded_at:        now,
  })
  .select('id')
  .single()

if (insertErr || !inserted) {
  console.error('Failed to insert waiver:', insertErr?.message ?? 'unknown')
  process.exit(1)
}

console.log(`Inserted waiver document id=${inserted.id} for ${TARGET_EMAIL}`)
