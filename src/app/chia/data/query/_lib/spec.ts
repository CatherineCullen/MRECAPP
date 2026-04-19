/**
 * QuerySpec — the JSON shape that AI Query accepts.
 *
 * The AI writes one of these; the app validates and executes it. The app
 * never accepts raw SQL, so the spec *is* the security boundary.
 *
 * Middleweight scope:
 *   - Single root table
 *   - Column selection (or "*")
 *   - FK embeds via aliases (parent and child, one level deep)
 *   - Filters with a whitelisted operator set
 *   - Sort, limit (capped at MAX_LIMIT)
 *   - `include_deleted` opt-in (default excludes soft-deleted rows)
 *
 * Out of scope for v1 (tell the AI to recommend Direct data access):
 *   - Aggregates / COUNT / SUM / GROUP BY
 *   - Multi-hop joins (a → b → c)
 *   - Arbitrary computed columns
 *   - Writes of any kind
 */

import { getTable, SCHEMA } from './schemaCatalog'

/**
 * Hard ceiling on rows returned. Above this, the question is a "pull
 * everything" question that belongs in Direct data access, not AI Query.
 * 50k covers multi-year histories of every table at MR scale.
 */
export const MAX_LIMIT = 50_000
export const DEFAULT_LIMIT = 500

/**
 * Above this row count, results are CSV-only — no on-screen table. A plain
 * HTML table with thousands of rows is slow to render and sluggish to scroll,
 * and at that size the admin isn't scanning row-by-row anyway; they're
 * pulling data out to analyze elsewhere.
 */
export const DISPLAY_CAP = 500

export const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'not_in', 'is_null', 'is_not_null'] as const
export type Operator = typeof OPERATORS[number]

export type Filter = {
  column: string
  op:     Operator
  /** Required for all ops except is_null / is_not_null. Arrays for in / not_in. */
  value?: string | number | boolean | null | Array<string | number | boolean>
}

export type Embed = {
  /** Alias from schemaCatalog relations, e.g. "riders", "horse" */
  relation: string
  /** Columns from the related table. Omit for all whitelisted columns. */
  columns?: string[]
}

export type Sort = {
  column: string
  dir:    'asc' | 'desc'
}

export type QuerySpec = {
  /** Root table name — must be whitelisted in SCHEMA. */
  table:          string
  /** Column list. Omit or use ["*"] for all whitelisted columns. */
  columns?:       string[]
  /** FK joins. One level deep. */
  embed?:         Embed[]
  /** Filters — ANDed together. */
  filters?:       Filter[]
  /** Sort specifications, applied in order. */
  sort?:          Sort[]
  /** Row limit. Capped at MAX_LIMIT. */
  limit?:         number
  /** By default soft-deleted rows (deleted_at IS NOT NULL) are excluded. */
  include_deleted?: boolean
}

export type ValidationError = {
  path:    string
  message: string
  hint?:   string
}

export type ValidatedSpec = {
  spec:    QuerySpec
  table:   ReturnType<typeof getTable> & {}   // non-undefined
}

/**
 * Parse a raw JSON string or object into a QuerySpec and validate against the
 * schema catalog. Returns either a validated spec or an array of errors with
 * specific hints — used by the UI to surface actionable feedback.
 */
export function validateSpec(input: unknown): { ok: true; value: ValidatedSpec } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = []
  const push = (e: ValidationError) => errors.push(e)

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '$', message: 'Spec must be a JSON object.' }] }
  }

  const raw = input as Record<string, unknown>

  // ── table
  if (typeof raw.table !== 'string') {
    push({ path: 'table', message: 'Required; must be a string naming a whitelisted table.' })
    return { ok: false, errors }
  }
  const table = getTable(raw.table)
  if (!table) {
    push({
      path: 'table',
      message: `Unknown table "${raw.table}".`,
      hint:   `Available tables: ${SCHEMA.map(t => t.name).join(', ')}. If your question needs a table not in this list, use Extensions → Direct data access instead.`,
    })
    return { ok: false, errors }
  }

  const colNames = new Set(table.columns.map(c => c.name))
  const relMap   = new Map(table.relations.map(r => [r.alias, r]))

  // ── columns
  if (raw.columns !== undefined) {
    if (!Array.isArray(raw.columns)) {
      push({ path: 'columns', message: 'Must be an array of column names or ["*"].' })
    } else {
      for (const c of raw.columns) {
        if (c === '*') continue
        if (typeof c !== 'string') {
          push({ path: 'columns', message: 'Each column must be a string.' })
          continue
        }
        if (!colNames.has(c)) {
          push({
            path:    `columns`,
            message: `Column "${c}" does not exist on table "${table.name}".`,
            hint:    `Available columns on ${table.name}: ${[...colNames].join(', ')}.`,
          })
        }
      }
    }
  }

  // ── embed
  if (raw.embed !== undefined) {
    if (!Array.isArray(raw.embed)) {
      push({ path: 'embed', message: 'Must be an array of { relation, columns? } objects.' })
    } else {
      for (let i = 0; i < raw.embed.length; i++) {
        const e = raw.embed[i] as Record<string, unknown>
        if (!e || typeof e !== 'object') {
          push({ path: `embed[${i}]`, message: 'Each embed must be an object.' })
          continue
        }
        if (typeof e.relation !== 'string' || !relMap.has(e.relation)) {
          push({
            path:    `embed[${i}].relation`,
            message: `Unknown relation "${e.relation}" on table "${table.name}".`,
            hint:    `Available relations: ${[...relMap.keys()].join(', ') || '(none)'}. Multi-hop embeds are not supported — use Direct data access for those.`,
          })
          continue
        }
        const rel        = relMap.get(String(e.relation))!
        const relTable   = getTable(rel.table)
        const relCols    = new Set(relTable?.columns.map(c => c.name) ?? [])
        if (e.columns !== undefined) {
          if (!Array.isArray(e.columns)) {
            push({ path: `embed[${i}].columns`, message: 'Must be an array of column names.' })
          } else {
            for (const c of e.columns) {
              if (typeof c !== 'string') {
                push({ path: `embed[${i}].columns`, message: 'Each column must be a string.' })
              } else if (!relCols.has(c)) {
                push({
                  path:    `embed[${i}].columns`,
                  message: `Column "${c}" does not exist on embedded table "${rel.table}".`,
                  hint:    `Available columns on ${rel.table}: ${[...relCols].join(', ')}.`,
                })
              }
            }
          }
        }
      }
    }
  }

  // ── filters
  if (raw.filters !== undefined) {
    if (!Array.isArray(raw.filters)) {
      push({ path: 'filters', message: 'Must be an array.' })
    } else {
      for (let i = 0; i < raw.filters.length; i++) {
        const f = raw.filters[i] as Record<string, unknown>
        if (!f || typeof f !== 'object') {
          push({ path: `filters[${i}]`, message: 'Each filter must be an object.' })
          continue
        }
        if (typeof f.column !== 'string' || !colNames.has(f.column)) {
          push({
            path:    `filters[${i}].column`,
            message: `Filter column "${f.column}" is not on table "${table.name}".`,
            hint:    `Filters apply to the root table only. For filters on embedded tables, use Direct data access.`,
          })
        }
        if (typeof f.op !== 'string' || !OPERATORS.includes(f.op as Operator)) {
          push({
            path:    `filters[${i}].op`,
            message: `Unknown operator "${f.op}".`,
            hint:    `Supported: ${OPERATORS.join(', ')}.`,
          })
        }
        const needsValue = !(f.op === 'is_null' || f.op === 'is_not_null')
        if (needsValue && f.value === undefined) {
          push({ path: `filters[${i}].value`, message: `Operator "${f.op}" requires a value.` })
        }
        if ((f.op === 'in' || f.op === 'not_in') && !Array.isArray(f.value)) {
          push({
            path:    `filters[${i}].value`,
            message: `"${f.op}" requires value to be an array.`,
          })
        }
      }
    }
  }

  // ── sort
  if (raw.sort !== undefined) {
    if (!Array.isArray(raw.sort)) {
      push({ path: 'sort', message: 'Must be an array.' })
    } else {
      for (let i = 0; i < raw.sort.length; i++) {
        const s = raw.sort[i] as Record<string, unknown>
        if (!s || typeof s !== 'object') {
          push({ path: `sort[${i}]`, message: 'Each sort must be an object.' })
          continue
        }
        if (typeof s.column !== 'string' || !colNames.has(s.column)) {
          push({
            path:    `sort[${i}].column`,
            message: `Sort column "${s.column}" is not on table "${table.name}".`,
          })
        }
        if (s.dir !== 'asc' && s.dir !== 'desc') {
          push({ path: `sort[${i}].dir`, message: 'Must be "asc" or "desc".' })
        }
      }
    }
  }

  // ── limit
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1) {
      push({ path: 'limit', message: 'Must be a positive integer.' })
    } else if (raw.limit > MAX_LIMIT) {
      push({
        path: 'limit',
        message: `Limit exceeds ${MAX_LIMIT}.`,
        hint:  `For bulk exports beyond ${MAX_LIMIT} rows, use Direct data access.`,
      })
    }
  }

  // ── include_deleted
  if (raw.include_deleted !== undefined && typeof raw.include_deleted !== 'boolean') {
    push({ path: 'include_deleted', message: 'Must be true or false.' })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok:    true,
    value: { spec: raw as unknown as QuerySpec, table },
  }
}
