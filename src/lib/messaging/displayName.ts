import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName, type NameablePerson } from '@/lib/displayName'

/**
 * Guardian-aware display label used in messaging surfaces.
 *
 * Guardians are the account holders for their minor children. When a guardian
 * appears in a thread (as a participant or as a sender), the label shows
 * their own name plus the minors they're a guardian for, so the other party
 * has context for which child the conversation likely concerns.
 *
 * "Jane Smith (Sarah)" — one minor
 * "Jane Smith (Sarah and Robert)" — multiple minors
 * "Paul Turner" — no minors (returns plain displayName)
 *
 * Minor names are first names only, sorted alphabetically for stable display.
 * If the minor has a preferred_name distinct from first_name, the preferred
 * name is used.
 */
export async function guardianMessageLabel(personId: string): Promise<string> {
  const db = createAdminClient()
  const { data: person } = await db
    .from('person')
    .select('first_name, last_name, preferred_name, is_organization, organization_name')
    .eq('id', personId)
    .maybeSingle()

  if (!person) return '—'

  const baseLabel = displayName(person as NameablePerson)

  const { data: minors } = await db
    .from('person')
    .select('first_name, preferred_name')
    .eq('guardian_id', personId)
    .eq('is_minor', true)
    .is('deleted_at', null)
    .order('first_name', { ascending: true })

  const minorNames = (minors ?? [])
    .map(m => {
      const first = (m.first_name ?? '').trim()
      const nick  = (m.preferred_name ?? '').trim()
      return nick && nick !== first ? nick : first
    })
    .filter(Boolean)

  if (minorNames.length === 0) return baseLabel

  const list = minorNames.length === 1
    ? minorNames[0]
    : minorNames.length === 2
      ? `${minorNames[0]} and ${minorNames[1]}`
      : `${minorNames.slice(0, -1).join(', ')}, and ${minorNames[minorNames.length - 1]}`

  return `${baseLabel} (${list})`
}

/**
 * Append "(admin)" suffix when the participant holds the admin role.
 * Used wherever an admin appears in a messaging context — header, bubble,
 * compose recipient picker. Per spec, admin presence is always visible.
 */
export function adminLabel(label: string): string {
  return `${label} (admin)`
}
