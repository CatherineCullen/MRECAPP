// One-off: create a temporary enrollment token tied to an existing person
// so we can preview the real enrollment form. Prints the URL on success.
// Cleans up after itself: delete the row or wait 5 minutes (configured TTL below).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter(l => !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, '$1')]
    }),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find any non-deleted person with a name to attach a stub token to.
const { data: ppl, error: pErr } = await db
  .from('person')
  .select('id, first_name, last_name')
  .is('deleted_at', null)
  .not('first_name', 'is', null)
  .limit(1)
if (pErr || !ppl?.[0]) { console.error('no person found', pErr); process.exit(1) }
const person = ppl[0]

const token = 'preview-' + crypto.randomBytes(8).toString('base64url')
const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

const { error: tErr } = await db.from('enrollment_token').insert({
  token,
  rider_person_id: person.id,
  guardian_person_id: null,
  kind: 'adult',
  template_kind: 'waiver',
  expires_at: expiresAt,
})
if (tErr) { console.error('insert failed', tErr); process.exit(1) }

console.log('PERSON:', person.first_name, person.last_name, person.id)
console.log('URL: http://localhost:3000/enroll/' + token)
console.log('EXPIRES:', expiresAt)
