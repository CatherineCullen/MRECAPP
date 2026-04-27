// Look up Catherine's ical token, fetch the feed locally, print events
// matching dates the user is checking on.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, '$1')] }),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const { data: ppl } = await db
  .from('person')
  .select('id, first_name, last_name, email, ical_token')
  .ilike('email', 'catherine.cullen@gmail.com')
  .limit(1)
if (!ppl?.[0]) { console.error('not found'); process.exit(1) }
const me = ppl[0]
console.log('person:', me.first_name, me.last_name, me.id, 'token?', !!me.ical_token)
if (!me.ical_token) { process.exit(1) }

const url = `http://localhost:3000/api/ical/${me.ical_token}/lessons.ics`
console.log('fetching', url)
const res = await fetch(url)
const text = await res.text()
console.log('---HEADERS---')
console.log('status', res.status, 'len', text.length)
console.log('---EVENTS containing 20260429 / 20260509 / Stokes / massage---')
// Parse VEVENTS
const events = text.split('BEGIN:VEVENT').slice(1).map(s => 'BEGIN:VEVENT' + s.split('END:VEVENT')[0] + 'END:VEVENT')
for (const ev of events) {
  if (/20260429|20260509|stokes|massage/i.test(ev)) {
    console.log('\n', ev)
  }
}
console.log(`\n(total events in feed: ${events.length})`)
