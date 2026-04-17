/**
 * Canonical person display name for CHIA.
 *
 * Rules (from people.md + accumulated product decisions):
 *  - Organization → organization_name (or "Organization" fallback)
 *  - Has a preferred_name distinct from the legal name → "First Last (Nickname)"
 *  - Otherwise → "First Last"
 *
 * A preferred_name equal to the first_name isn't a nickname — don't parenthesize.
 * A preferred_name equal to the full "First Last" string also isn't additive.
 *
 * Used everywhere a person is surfaced: calendar cards, subscription lists,
 * rider tables, token pages, lesson detail, etc. DO NOT fork this logic —
 * inconsistency between views was the original bug this helper exists to prevent.
 */
export type NameablePerson = {
  first_name?:        string | null
  last_name?:         string | null
  preferred_name?:    string | null
  is_organization?:   boolean | null
  organization_name?: string | null
}

export function displayName(p: NameablePerson | null | undefined): string {
  if (!p) return '—'
  if (p.is_organization) return p.organization_name?.trim() || 'Organization'

  const first = (p.first_name ?? '').trim()
  const last  = (p.last_name  ?? '').trim()
  const full  = `${first} ${last}`.trim()
  const nick  = (p.preferred_name ?? '').trim()

  if (!full && !nick) return '—'
  if (!full) return nick
  if (!nick) return full
  if (nick === full || nick === first) return full
  return `${full} (${nick})`
}

/**
 * Compact display name for space-constrained UI (narrow calendar cards,
 * dense tables). Rules:
 *  - Organization → organization_name (no shortening — orgs are rarely seen here anyway)
 *  - Has preferred_name distinct from first_name → preferred_name alone ("Cat")
 *  - Otherwise → "First L."
 *
 * This matches how barn staff actually refer to riders verbally — preferred name
 * when it's distinct, else first name + last initial.
 */
export function shortName(p: NameablePerson | null | undefined): string {
  if (!p) return '—'
  if (p.is_organization) return p.organization_name?.trim() || 'Organization'

  const first = (p.first_name ?? '').trim()
  const last  = (p.last_name  ?? '').trim()
  const nick  = (p.preferred_name ?? '').trim()

  if (nick && nick !== first && nick !== `${first} ${last}`.trim()) {
    return nick
  }
  if (first && last) return `${first} ${last[0]}.`
  return first || last || '—'
}

/**
 * Two-letter initials from a person's legal name. Stable identity marker —
 * ignores preferred_name so "Cat" and "Catherine" on the same person render
 * identically wherever this is used (lesson-card instructor stripe).
 */
export function personInitials(p: NameablePerson | null | undefined): string {
  if (!p) return '??'
  if (p.is_organization) {
    const word = (p.organization_name ?? '').trim()
    return word ? (word[0] + (word[1] ?? '')).toUpperCase() : '??'
  }
  const first = (p.first_name ?? '').trim()
  const last  = (p.last_name  ?? '').trim()
  const a = first ? first[0] : ''
  const b = last  ? last[0]  : ''
  const initials = (a + b).toUpperCase()
  return initials || '??'
}

