// One-off probe to confirm NMI invoicing works end-to-end.
//
// Creates a $1 test invoice in sandbox and emails the hosted pay-link
// to catherine.cullen@gmail.com (the merchant account email — sandbox
// only emails to that address).
//
// No money is actually moved unless the invoice is paid. Sandbox only.
//
// Run from the app/ directory:
//   node scripts/nmi-probe.mjs
//
// Reads NMI_SECURITY_KEY from .env.local.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(here, '..', '.env.local')

if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath} — put NMI_SECURITY_KEY there first.`)
  process.exit(1)
}

for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
  if (!m) continue
  const [, k, rawV] = m
  if (process.env[k]) continue
  process.env[k] = rawV.replace(/^["']|["']$/g, '')
}

const SECURITY_KEY = process.env.NMI_SECURITY_KEY
if (!SECURITY_KEY) {
  console.error('Missing NMI_SECURITY_KEY in .env.local')
  process.exit(1)
}

const URLS_TO_TRY = ['https://sandbox.nmi.com/api/transact.php']

const PROBE_ID = `chia-probe-${Date.now()}`

const params = new URLSearchParams({
  security_key: SECURITY_KEY,
  invoicing: 'add_invoice',
  amount: '1.00',
  email: 'catherine.cullen@gmail.com',
  first_name: 'CHIA',
  last_name: 'Probe',
  order_description: 'CHIA NMI sandbox probe — please ignore',
  payment_terms: 'upon_receipt',
  item_description_1: 'Sandbox probe line item',
  item_unit_cost_1: '1.00',
  item_quantity_1: '1',
  merchant_defined_field_1: PROBE_ID,
})

function responseLabel(code) {
  return { '1': 'APPROVED', '2': 'DECLINED', '3': 'ERROR' }[code] || 'UNKNOWN'
}

async function probe(url) {
  console.log(`\n→ Trying ${url}`)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const text = await res.text()
    const parsed = Object.fromEntries(new URLSearchParams(text))
    console.log(`  HTTP ${res.status}`)
    console.log(`  response=${parsed.response} (${responseLabel(parsed.response)})`)
    console.log(`  responsetext=${parsed.responsetext}`)
    if (parsed.customer_vault_id) {
      console.log(`  customer_vault_id=${parsed.customer_vault_id}`)
    }
    console.log(`  raw response: ${text}`)
    return { url, ok: parsed.response === '1', parsed, status: res.status }
  } catch (err) {
    console.log(`  network error: ${err.message}`)
    return { url, ok: false, error: err.message }
  }
}

console.log(`Probe ID: ${PROBE_ID}`)
console.log(
  `Key: ${SECURITY_KEY.slice(0, 4)}...${SECURITY_KEY.slice(-4)} (${SECURITY_KEY.length} chars)`,
)

const results = []
for (const url of URLS_TO_TRY) {
  const r = await probe(url)
  results.push(r)
  if (r.ok) break
}

console.log('\n=== Summary ===')
const winner = results.find((r) => r.ok)
if (winner) {
  console.log(`Working endpoint: ${winner.url}`)
  console.log(`Invoice created. NMI invoice id: ${winner.parsed.invoice_id || '(check raw)'}`)
  console.log(`Check catherine.cullen@gmail.com inbox for the hosted pay-link email.`)
  console.log(`Probe ID stamped on invoice: ${PROBE_ID}`)
} else {
  console.log('Neither endpoint worked. Diagnostics above.')
  console.log('Likely causes:')
  console.log('  - Sandbox host is reseller-branded (TouchSuite-specific URL)')
  console.log('  - Key was revoked or not yet activated')
  console.log('  - Network or DNS issue')
  console.log('Send the output above and I can advise next step.')
}
