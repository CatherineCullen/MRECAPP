'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { validateMigration } from './_lib/validate'
import type { MigrationInput, PersonInput } from './_lib/schema'
import type { ValidationError } from './_lib/schema'

// Server-action return shapes are loose on purpose — validate returns the
// same envelope shape whether it succeeds or fails, and commit returns a
// per-entity count so the UI can show "inserted N people, N horses" afterward.

export type ValidateResult =
  | { ok: true;  summary: { peopleCount: number; horsesCount: number; contactsCount: number; rolesCount: number } }
  | { ok: false; errors: ValidationError[] }

export type CommitResult =
  | { ok: true;  inserted: { people: number; horses: number; contacts: number; roles: number } }
  | { ok: false; errors: ValidationError[] }

/**
 * Parse JSON + validate. No DB writes. Used by the UI's "Dry run" button.
 */
export async function validatePayload(rawJson: string): Promise<ValidateResult> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, errors: [{ path: '$', message: 'Admin access required.' }] }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON.'
    return { ok: false, errors: [{ path: '$', message: `JSON parse failed: ${msg}` }] }
  }

  const result = validateMigration(parsed)
  if (!result.ok) return { ok: false, errors: result.errors }
  return { ok: true, summary: result.summary }
}

/**
 * Full commit: validate + insert people + insert person_roles + insert horses
 * + insert horse_contacts. No transactional rollback — this is a one-time
 * migration tool with a human doing dry-run first. If commit fails partway,
 * we return clearly which step failed and what's been inserted so the admin
 * can clean up and re-run against a reduced payload.
 */
export async function commitPayload(rawJson: string): Promise<CommitResult> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, errors: [{ path: '$', message: 'Admin access required.' }] }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON.'
    return { ok: false, errors: [{ path: '$', message: `JSON parse failed: ${msg}` }] }
  }

  const validation = validateMigration(parsed)
  if (!validation.ok) return { ok: false, errors: validation.errors }
  const payload: MigrationInput = validation.normalized

  const supabase = createAdminClient()

  // ── Sort people: non-minors first (so guardians exist when we insert minors)
  const sorted = sortPeopleByDependency(payload.people)
  if ('error' in sorted) {
    return { ok: false, errors: [{ path: 'people', message: sorted.error }] }
  }

  const refToId = new Map<string, string>()
  let peopleInserted = 0
  let rolesInserted  = 0

  for (const p of sorted.order) {
    const guardianId = p.guardian_ref ? refToId.get(p.guardian_ref) : null

    const personRow = {
      first_name:                p.first_name.trim(),
      last_name:                 p.last_name.trim(),
      preferred_name:            p.preferred_name ?? null,
      email:                     p.email ?? null,
      phone:                     p.phone ?? null,
      address:                   p.address ?? null,
      date_of_birth:             p.date_of_birth ?? null,
      is_minor:                  p.is_minor ?? false,
      guardian_id:               guardianId ?? null,
      is_organization:           p.is_organization ?? false,
      organization_name:         p.organization_name ?? null,
      weight_category:           p.weight_category ?? null,
      riding_level:              p.riding_level ?? null,
      height:                    p.height ?? null,
      usef_id:                   p.usef_id ?? null,
      is_training_ride_provider: p.is_training_ride_provider ?? false,
      provider_type:             p.provider_type ?? null,
      notes:                     p.notes ?? null,
    }
    const { data, error } = await supabase
      .from('person')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(personRow as any)
      .select('id')
      .single()

    if (error || !data) {
      return {
        ok: false,
        errors: [{
          path:    `people[_ref=${p._ref}]`,
          message: `Insert failed: ${error?.message ?? 'unknown error'}`,
          hint:    peopleInserted > 0
            ? `${peopleInserted} people and 0 horses were inserted before this failure. Remove the failing records and re-run.`
            : undefined,
        }],
      }
    }

    refToId.set(p._ref, data.id)
    peopleInserted++

    // Roles
    if (p.roles && p.roles.length > 0) {
      const roleRows = p.roles.map(role => ({ person_id: data.id, role }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: roleErr } = await supabase.from('person_role').insert(roleRows as any)
      if (roleErr) {
        return {
          ok: false,
          errors: [{
            path:    `people[_ref=${p._ref}].roles`,
            message: `Role insert failed: ${roleErr.message}`,
            hint:    `Person record was inserted but role assignment failed. You'll need to remove this person or add roles manually before re-running.`,
          }],
        }
      }
      rolesInserted += roleRows.length
    }
  }

  // ── Horses + contacts
  let horsesInserted   = 0
  let contactsInserted = 0

  for (const h of payload.horses) {
    const horseRow = {
      barn_name:       h.barn_name.trim(),
      registered_name: h.registered_name ?? null,
      breed:           h.breed ?? null,
      color:           h.color ?? null,
      gender:          h.gender ?? null,
      date_of_birth:   h.date_of_birth ?? null,
      height:          h.height ?? null,
      weight:          h.weight ?? null,
      microchip:       h.microchip ?? null,
      stall:           h.stall ?? null,
      status:          h.status ?? 'active',
      notes:           h.notes ?? null,
      ownership_notes: h.ownership_notes ?? null,
      turnout_notes:   h.turnout_notes ?? null,
      solo_turnout:    h.solo_turnout ?? false,
      lesson_horse:    h.lesson_horse ?? false,
    }
    const { data, error } = await supabase
      .from('horse')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(horseRow as any)
      .select('id')
      .single()

    if (error || !data) {
      return {
        ok: false,
        errors: [{
          path:    `horses[barn_name=${h.barn_name}]`,
          message: `Insert failed: ${error?.message ?? 'unknown error'}`,
          hint:    `${peopleInserted} people and ${horsesInserted} horses inserted before this failure.`,
        }],
      }
    }

    horsesInserted++

    if (h.contacts && h.contacts.length > 0) {
      const contactRows = h.contacts.map(c => {
        const personId = refToId.get(c.person_ref)
        return {
          horse_id:                      data.id,
          person_id:                     personId!,
          role:                          c.role ?? null,
          is_billing_contact:            c.is_billing_contact ?? false,
          can_log_in:                    c.can_log_in ?? false,
          can_log_services:              c.can_log_services ?? false,
          receives_health_alerts:        c.receives_health_alerts ?? false,
          receives_lesson_notifications: c.receives_lesson_notifications ?? false,
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: contactErr } = await supabase.from('horse_contact').insert(contactRows as any)
      if (contactErr) {
        return {
          ok: false,
          errors: [{
            path:    `horses[barn_name=${h.barn_name}].contacts`,
            message: `Contact insert failed: ${contactErr.message}`,
          }],
        }
      }
      contactsInserted += contactRows.length
    }
  }

  return {
    ok: true,
    inserted: {
      people:   peopleInserted,
      horses:   horsesInserted,
      contacts: contactsInserted,
      roles:    rolesInserted,
    },
  }
}

/**
 * Topological sort: non-minors + minors whose guardian is also a non-minor
 * come first, so guardian IDs exist by the time we insert dependent minors.
 * For the barn's shape this will rarely be more than two layers deep.
 */
function sortPeopleByDependency(people: PersonInput[]):
  | { order: PersonInput[] }
  | { error: string }
{
  const byRef = new Map(people.map(p => [p._ref, p]))
  const ordered: PersonInput[] = []
  const placed = new Set<string>()

  // Simple iterative: place anyone whose guardian_ref is either null or already placed.
  let safety = people.length + 1
  while (ordered.length < people.length && safety-- > 0) {
    const before = ordered.length
    for (const p of people) {
      if (placed.has(p._ref)) continue
      const ready = !p.guardian_ref || placed.has(p.guardian_ref)
      if (ready) {
        if (p.guardian_ref && !byRef.has(p.guardian_ref)) {
          return { error: `Person "${p._ref}" references unknown guardian "${p.guardian_ref}".` }
        }
        ordered.push(p)
        placed.add(p._ref)
      }
    }
    if (ordered.length === before) {
      const stuck = people.filter(p => !placed.has(p._ref)).map(p => p._ref)
      return { error: `Cycle detected in guardian_ref among: ${stuck.join(', ')}.` }
    }
  }

  return { order: ordered }
}
