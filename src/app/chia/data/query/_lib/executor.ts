import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_LIMIT, MAX_LIMIT, type QuerySpec, type Filter } from './spec'
import { getTable } from './schemaCatalog'

/**
 * Execute a validated QuerySpec against Supabase.
 *
 * The validator has already confirmed the table, columns, relations, operators,
 * and limits are all whitelisted — we don't re-check here, we just translate.
 *
 * Execution path is PostgREST via the admin client. We compose a select string
 * from the spec (columns + FK embeds with aliasing), then layer filters / sort
 * / limit on top. No raw SQL anywhere.
 */
export async function executeSpec(spec: QuerySpec): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const table = getTable(spec.table)
  if (!table) throw new Error(`Table ${spec.table} is not whitelisted.`)

  const db: SupabaseClient = createAdminClient()

  // ── Build the select string
  const rootCols = (!spec.columns || spec.columns.includes('*'))
    ? table.columns.map(c => c.name)
    : spec.columns

  const parts: string[] = [...rootCols]

  if (spec.embed) {
    for (const e of spec.embed) {
      const rel = table.relations.find(r => r.alias === e.relation)!
      const relTable = getTable(rel.table)!
      const relCols = (!e.columns || e.columns.includes('*'))
        ? relTable.columns.map(c => c.name)
        : e.columns
      // Supabase alias syntax: alias:target!constraint ( col1, col2 )
      parts.push(`${rel.alias}:${rel.table}!${rel.fkConstraint} ( ${relCols.join(', ')} )`)
    }
  }

  const selectStr = parts.join(', ')

  // ── Base query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.from(spec.table).select(selectStr)

  // ── Soft-delete default
  const hasDeletedAt = table.columns.some(c => c.name === 'deleted_at')
  if (hasDeletedAt && !spec.include_deleted) {
    q = q.is('deleted_at', null)
  }

  // ── Filters
  for (const f of spec.filters ?? []) {
    q = applyFilter(q, f)
  }

  // ── Sort
  for (const s of spec.sort ?? []) {
    q = q.order(s.column, { ascending: s.dir === 'asc' })
  }

  // ── Limit + pagination
  // PostgREST caps a single response at 1000 rows (its default `max-rows`).
  // To honor a user-requested limit above that, we loop in 1000-row chunks.
  // This keeps the public API of the spec consistent (user says limit, we
  // deliver up to that) without changing the Postgres config.
  const PAGE_SIZE = 1000
  const requestedLimit = Math.min(spec.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const rows: Record<string, unknown>[] = []

  // Save the query builder state before paging — each .range() call returns
  // a fresh query that we rebuild each loop via clone-by-rebuild.
  let offset = 0
  while (rows.length < requestedLimit) {
    const pageEnd = Math.min(offset + PAGE_SIZE, requestedLimit) - 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (q.range(offset, pageEnd) as any)
    if (error) throw new Error(`Query failed: ${error.message}`)
    const page = (data ?? []) as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < (pageEnd - offset + 1)) break // fewer rows than asked — done
    offset += PAGE_SIZE
  }

  // Column order for rendering: root columns first (in spec order), then each
  // embed alias as a single column of stringified JSON (the table view
  // flattens this per-row below).
  const columns = [
    ...rootCols,
    ...(spec.embed?.map(e => e.relation) ?? []),
  ]

  return { rows, columns }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(q: any, f: Filter): any {
  switch (f.op) {
    case 'eq':           return q.eq(f.column, f.value)
    case 'neq':          return q.neq(f.column, f.value)
    case 'gt':           return q.gt(f.column, f.value)
    case 'gte':          return q.gte(f.column, f.value)
    case 'lt':           return q.lt(f.column, f.value)
    case 'lte':          return q.lte(f.column, f.value)
    case 'like':         return q.like(f.column, String(f.value))
    case 'ilike':        return q.ilike(f.column, String(f.value))
    case 'in':           return q.in(f.column, f.value as (string | number | boolean)[])
    case 'not_in':       return q.not(f.column, 'in', `(${(f.value as unknown[]).map(v => typeof v === 'string' ? `"${v}"` : v).join(',')})`)
    case 'is_null':      return q.is(f.column, null)
    case 'is_not_null':  return q.not(f.column, 'is', null)
    default:             return q
  }
}
