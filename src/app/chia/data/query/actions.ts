'use server'

import { validateSpec } from './_lib/spec'
import { executeSpec } from './_lib/executor'

export type RunQueryResult =
  | { ok: true;  rows: Record<string, unknown>[]; columns: string[]; rowCount: number }
  | { ok: false; errors: { path: string; message: string; hint?: string }[] }
  | { ok: false; errors: { path: string; message: string; hint?: string }[]; parseError: true }

/**
 * Accepts a JSON string (what the admin pasted). Parses, validates against
 * the schema catalog, executes through Supabase. Returns actionable errors
 * with hints that point the admin toward Direct data access when the
 * question is beyond the whitelist.
 */
export async function runQuery(raw: string): Promise<RunQueryResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok:         false,
      parseError: true,
      errors: [{
        path:    '$',
        message: `The pasted text isn't valid JSON: ${e instanceof Error ? e.message : String(e)}.`,
        hint:    'Make sure you copied the spec exactly — matching braces, no trailing commas.',
      }],
    }
  }

  const validation = validateSpec(parsed)
  if (!validation.ok) {
    return { ok: false, errors: validation.errors }
  }

  try {
    const { rows, columns } = await executeSpec(validation.value.spec)
    return { ok: true, rows, columns, rowCount: rows.length }
  } catch (e) {
    return {
      ok: false,
      errors: [{
        path:    '$',
        message: `Query failed when running: ${e instanceof Error ? e.message : String(e)}.`,
        hint:    'If this keeps happening, the question may need direct database access — see Extensions → Direct data access.',
      }],
    }
  }
}
