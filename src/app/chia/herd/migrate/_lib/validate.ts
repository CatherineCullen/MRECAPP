import {
  PERSON_ROLES,
  HORSE_STATUSES,
  WEIGHT_CATEGORIES,
  RIDING_LEVELS,
  type PersonInput,
  type HorseInput,
  type MigrationInput,
  type ValidationError,
  type ValidationResult,
} from './schema'

/**
 * Validate a migration payload. No DB calls — pure structural + cross-reference
 * validation. Produces either a normalized MigrationInput (ready to insert) or
 * a list of actionable errors pinned to JSON paths.
 */
export function validateMigration(input: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const push = (e: ValidationError) => errors.push(e)

  if (!isObject(input)) {
    return { ok: false, errors: [{ path: '$', message: 'Payload must be a JSON object with "people" and "horses".' }] }
  }

  const people = Array.isArray(input.people) ? input.people : null
  const horses = Array.isArray(input.horses) ? input.horses : null

  if (!people) push({ path: 'people', message: 'Required. Must be an array (use [] if no people).' })
  if (!horses) push({ path: 'horses', message: 'Required. Must be an array (use [] if no horses).' })
  if (!people || !horses) return { ok: false, errors }

  // ── People, pass 1: structural
  const refs = new Set<string>()
  const normalizedPeople: PersonInput[] = []
  let rolesCount = 0

  for (let i = 0; i < people.length; i++) {
    const p = people[i]
    const path = `people[${i}]`
    if (!isObject(p)) { push({ path, message: 'Must be an object.' }); continue }

    // _ref
    if (typeof p._ref !== 'string' || p._ref.trim().length === 0) {
      push({ path: `${path}._ref`, message: 'Required. A unique slug you pick so horses can reference this person.' })
      continue
    }
    if (refs.has(p._ref)) {
      push({ path: `${path}._ref`, message: `Duplicate _ref "${p._ref}". Each person needs a unique reference.` })
      continue
    }
    refs.add(p._ref)

    // Names
    if (typeof p.first_name !== 'string' || p.first_name.trim().length === 0) {
      push({ path: `${path}.first_name`, message: 'Required.' })
    }
    if (typeof p.last_name !== 'string' || p.last_name.trim().length === 0) {
      push({ path: `${path}.last_name`, message: 'Required.' })
    }

    // Organization invariant
    if (p.is_organization && (typeof p.organization_name !== 'string' || p.organization_name.trim().length === 0)) {
      push({ path: `${path}.organization_name`, message: 'Required when is_organization is true.' })
    }

    // Enums
    if (p.weight_category != null && !(WEIGHT_CATEGORIES as readonly string[]).includes(String(p.weight_category))) {
      push({ path: `${path}.weight_category`, message: `Must be one of: ${WEIGHT_CATEGORIES.join(', ')}.` })
    }
    if (p.riding_level != null && !(RIDING_LEVELS as readonly string[]).includes(String(p.riding_level))) {
      push({ path: `${path}.riding_level`, message: `Must be one of: ${RIDING_LEVELS.join(', ')}.` })
    }

    // Roles
    if (p.roles != null) {
      if (!Array.isArray(p.roles)) {
        push({ path: `${path}.roles`, message: 'Must be an array of role strings.' })
      } else {
        for (let r = 0; r < p.roles.length; r++) {
          const role = p.roles[r]
          if (!(PERSON_ROLES as readonly string[]).includes(String(role))) {
            push({
              path:    `${path}.roles[${r}]`,
              message: `Unknown role "${String(role)}".`,
              hint:    `Available: ${PERSON_ROLES.join(', ')}.`,
            })
          }
        }
        rolesCount += p.roles.length
      }
    }

    // Date
    if (p.date_of_birth != null && !isDateLike(p.date_of_birth)) {
      push({ path: `${path}.date_of_birth`, message: 'Must be an ISO date (YYYY-MM-DD).' })
    }

    normalizedPeople.push(p as PersonInput)
  }

  // ── People, pass 2: guardian_ref resolution
  for (let i = 0; i < normalizedPeople.length; i++) {
    const p = normalizedPeople[i]
    if (p.is_minor) {
      if (!p.guardian_ref) {
        push({ path: `people[${i}].guardian_ref`, message: 'Required when is_minor is true.' })
      } else if (!refs.has(p.guardian_ref)) {
        push({
          path:    `people[${i}].guardian_ref`,
          message: `Unknown guardian _ref "${p.guardian_ref}".`,
          hint:    `Guardian must be another person in the same payload. Available _refs: ${[...refs].join(', ')}.`,
        })
      } else if (p.guardian_ref === p._ref) {
        push({ path: `people[${i}].guardian_ref`, message: 'Minor cannot be their own guardian.' })
      }
    }
  }

  // ── Horses
  const normalizedHorses: HorseInput[] = []
  let contactsCount = 0

  for (let i = 0; i < horses.length; i++) {
    const h = horses[i]
    const path = `horses[${i}]`
    if (!isObject(h)) { push({ path, message: 'Must be an object.' }); continue }

    if (typeof h.barn_name !== 'string' || h.barn_name.trim().length === 0) {
      push({ path: `${path}.barn_name`, message: 'Required.' })
    }

    if (h.status != null && !(HORSE_STATUSES as readonly string[]).includes(String(h.status))) {
      push({
        path:    `${path}.status`,
        message: `Unknown status "${h.status}".`,
        hint:    `Available: ${HORSE_STATUSES.join(', ')}. Defaults to "active" on import.`,
      })
    }

    if (h.date_of_birth != null && !isDateLike(h.date_of_birth)) {
      push({ path: `${path}.date_of_birth`, message: 'Must be an ISO date (YYYY-MM-DD).' })
    }

    if (h.height != null && typeof h.height !== 'number') {
      push({ path: `${path}.height`, message: 'Must be a number (hands, e.g. 16.2).' })
    }
    if (h.weight != null && typeof h.weight !== 'number') {
      push({ path: `${path}.weight`, message: 'Must be a number (lbs, estimated).' })
    }

    if (h.contacts != null) {
      if (!Array.isArray(h.contacts)) {
        push({ path: `${path}.contacts`, message: 'Must be an array.' })
      } else {
        const seen = new Set<string>()
        for (let c = 0; c < h.contacts.length; c++) {
          const contact = h.contacts[c]
          const cPath = `${path}.contacts[${c}]`
          if (!isObject(contact)) { push({ path: cPath, message: 'Must be an object.' }); continue }
          if (typeof contact.person_ref !== 'string') {
            push({ path: `${cPath}.person_ref`, message: 'Required.' })
            continue
          }
          if (!refs.has(contact.person_ref)) {
            push({
              path:    `${cPath}.person_ref`,
              message: `Unknown person _ref "${contact.person_ref}".`,
              hint:    `Must match a _ref in the "people" array. Available: ${[...refs].join(', ')}.`,
            })
            continue
          }
          if (seen.has(contact.person_ref)) {
            push({
              path:    `${cPath}.person_ref`,
              message: `Duplicate contact for "${contact.person_ref}" on this horse.`,
            })
            continue
          }
          seen.add(contact.person_ref)
          contactsCount++
        }
      }
    }

    normalizedHorses.push(h as HorseInput)
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    summary: {
      peopleCount:   normalizedPeople.length,
      horsesCount:   normalizedHorses.length,
      contactsCount,
      rolesCount,
    },
    normalized: { people: normalizedPeople, horses: normalizedHorses } as MigrationInput,
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function isDateLike(v: unknown): boolean {
  if (typeof v !== 'string') return false
  // Accept YYYY-MM-DD or full ISO
  return /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)
}
