// Shared env loader for admin scripts.
//
// Why this exists: these scripts use the Supabase service-role key, which
// bypasses RLS. We do NOT want it hardcoded in source (GitGuardian caught
// exactly that on 2026-04-22 and we rotated the key). This loader reads
// from app/.env.local at runtime so the key never lives in git.
//
// Usage:
//   import { supabaseAdmin } from './_env.mjs'
//   const db = supabaseAdmin()
//
// Run scripts from the app/ dir:
//   node scripts/your-script.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here    = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(here, '..', '.env.local')

if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath} — scripts need Supabase creds there.`)
  process.exit(1)
}

// Tiny .env parser — good enough for this file; skip anything fancy.
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
  if (!m) continue
  const [, k, rawV] = m
  if (process.env[k]) continue
  const v = rawV.replace(/^["']|["']$/g, '')
  process.env[k] = v
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

export function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY)
}
