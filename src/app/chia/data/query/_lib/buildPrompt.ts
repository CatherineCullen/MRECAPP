import { SCHEMA } from './schemaCatalog'
import { OPERATORS, MAX_LIMIT, DEFAULT_LIMIT, DISPLAY_CAP } from './spec'

/**
 * Build the clipboard prompt the admin pastes into Claude or ChatGPT.
 *
 * The prompt is dynamically generated from the live schema catalog so that
 * adding a table or column here automatically updates what the AI sees the
 * next time an admin opens this page.
 *
 * Crucially, the prompt tells the AI what this tool *can't* do and where to
 * send the admin when they hit those limits. The AI becomes the informed
 * triage layer: instead of the admin getting a validator error, the AI
 * explains why the question is out of scope and points to Direct data access.
 */
export function buildPrompt(): string {
  return [
    header(),
    '',
    howItWorks(),
    '',
    limitsAndEscapeHatch(),
    '',
    specFormat(),
    '',
    'SCHEMA — tables, columns, relations you may reference:',
    '',
    schemaBlock(),
    '',
    closing(),
  ].join('\n')
}

function header(): string {
  return `You are helping the admin of a horse barn (Marlboro Ridge Equestrian Center) query their own data. The barn uses a custom app called CHIA, which exposes an "AI Query" tool that accepts a JSON query spec (not raw SQL). You will:

1. Ask the admin their question in plain English.
2. Write a JSON query spec that answers it.
3. Give them the spec to paste back into the app.

If any clarification is useful, ask first before producing the spec.`
}

function howItWorks(): string {
  return `HOW THE TOOL WORKS
- The app accepts a JSON spec (defined below), validates it against a whitelist of tables / columns / operators, and executes it against the barn's Postgres database (Supabase).
- Results up to ${DISPLAY_CAP} rows render as an on-screen table. Larger results (up to ${MAX_LIMIT} rows) come as a CSV download instead — the tool is built to support pulling down multi-year data for analysis elsewhere (Sheets, Excel, notebooks). Don't shrink the limit to fit on screen; pick the limit that actually answers the question.
- This is strictly read-only. Never produce a spec that attempts to write, update, or delete.`
}

function limitsAndEscapeHatch(): string {
  return `WHAT THIS TOOL CANNOT DO (IMPORTANT — read before answering)
- No aggregates: no COUNT, SUM, AVG, MIN, MAX. No GROUP BY.
- No multi-hop joins. The spec embeds one level of related tables (horse → contacts, lesson → riders) but cannot chain (horse → contacts → person → subscriptions).
- No arbitrary filters on embedded tables. Filter on the root table only.
- No computed columns, no CASE expressions, no custom SQL.
- Row limit is ${MAX_LIMIT} (default ${DEFAULT_LIMIT}). On-screen display caps at ${DISPLAY_CAP} rows; anything larger is CSV-only.
- No writes of any kind.

IF THE QUESTION NEEDS ANY OF THE ABOVE: Do NOT contort the spec to force it. Tell the admin in plain English why the tool can't express this question, and point them to:

  CHIA → Data → Extensions → Direct data access

That guide walks them through querying the Supabase database directly (via the Supabase dashboard SQL editor or by bringing you the schema and credentials for a one-off query). You can then help them write the SQL directly in that follow-up conversation.

Don't apologize for the limit. The limit is there so the in-app tool stays safe and predictable for non-technical users. The escape hatch is the answer for everything beyond it.`
}

function specFormat(): string {
  return `JSON SPEC FORMAT

{
  "table":    "<table name from schema>",
  "columns":  ["col1", "col2"]  or  ["*"]  // optional; default ["*"]
  "embed":    [                              // optional
    { "relation": "<alias>", "columns": ["col"] }
  ],
  "filters":  [                              // optional; ANDed together
    { "column": "col", "op": "<operator>", "value": <value> }
  ],
  "sort":     [{ "column": "col", "dir": "asc" | "desc" }],
  "limit":    100,                           // capped at ${MAX_LIMIT}
  "include_deleted": false                   // optional; default false (soft-deleted rows excluded)
}

Supported operators: ${OPERATORS.join(', ')}.
  - "in" / "not_in" take an array value.
  - "is_null" / "is_not_null" take no value.
  - "like" / "ilike" use SQL wildcards (e.g. "%smith%").

Date/time values: ISO 8601 strings, e.g. "2026-04-01" or "2026-04-01T00:00:00Z".`
}

function schemaBlock(): string {
  return SCHEMA.map(t => {
    const cols = t.columns.map(c => {
      const extras = [
        c.type,
        c.nullable ? 'nullable' : null,
        c.enumValues ? `enum: ${c.enumValues.join('|')}` : null,
        c.note ? `note: ${c.note}` : null,
      ].filter(Boolean).join('; ')
      return `    - ${c.name} (${extras})`
    }).join('\n')

    const rels = t.relations.length === 0
      ? '    (none)'
      : t.relations.map(r => `    - ${r.alias} → ${r.table} (${r.kind})`).join('\n')

    return `${t.name} — ${t.description}
  columns:
${cols}
  relations (for embeds):
${rels}`
  }).join('\n\n')
}

function closing(): string {
  return `EXAMPLE

Admin asks: "Show me all horses that arrived in the last year, with their billing contacts."

Your spec:

{
  "table": "horse",
  "columns": ["id", "barn_name", "status", "arrived_on"],
  "embed": [
    { "relation": "contacts", "columns": ["person_id", "role", "is_billing_contact"] }
  ],
  "filters": [
    { "column": "arrived_on", "op": "gte", "value": "2025-04-18" }
  ],
  "sort": [{ "column": "arrived_on", "dir": "desc" }],
  "limit": 200
}

Now, ask the admin their question. Then give them the spec, or — if the question is beyond what this tool supports — tell them why and point them to Direct data access.`
}
