import {
  PERSON_ROLES,
  HORSE_STATUSES,
  WEIGHT_CATEGORIES,
  RIDING_LEVELS,
} from './schema'

/**
 * Clipboard prompt: "remap the raw source capture into CHIA's migration shape."
 *
 * Assumes Catherine (or whoever) has already done a broad sweep of the old
 * system using Claude-in-Chrome and has raw, source-shaped JSON in hand. This
 * prompt converts that into the shape our importer expects.
 *
 * The extraction prompt itself (what to tell Claude-in-Chrome when sweeping
 * the source system) lives outside this tool — in the conversation where
 * Catherine is working. Extraction is broad and source-shaped; mapping is
 * what this prompt is for.
 */
export function buildMigrationMappingPrompt(): string {
  return [
    header(),
    '',
    shape(),
    '',
    rules(),
    '',
    closing(),
  ].join('\n')
}

function header(): string {
  return `You are helping an admin migrate horse and people records from an old barn management system into a new one called CHIA. They have already extracted the raw data from the old system as source-shaped JSON. Your job is to remap it into CHIA's migration format, below.

When they paste the raw JSON, produce a single JSON object with "people" and "horses" arrays, formatted exactly as specified. Ask clarifying questions up front if the source data is ambiguous (e.g. one "owner" field with two names in it, minors without guardians). Otherwise produce the JSON in one pass and explain any assumptions at the end.`
}

function shape(): string {
  return `TARGET SHAPE

{
  "people": [
    {
      "_ref":              "<unique slug — kebab-case, e.g. 'jane-smith'>",
      "first_name":        "<required>",
      "last_name":         "<required>",
      "preferred_name":    null,
      "email":             null,
      "phone":             null,
      "address":           null,
      "date_of_birth":     null,           // "YYYY-MM-DD" or null
      "is_minor":          false,
      "guardian_ref":      null,           // required when is_minor: true; value is another person's _ref
      "is_organization":   false,
      "organization_name": null,           // required when is_organization: true
      "weight_category":   null,           // ${WEIGHT_CATEGORIES.join(' | ')} | null
      "riding_level":      null,           // ${RIDING_LEVELS.join(' | ')} | null
      "height":            null,
      "usef_id":           null,
      "is_training_ride_provider": false,
      "provider_type":     null,
      "notes":             null,
      "roles":             ["boarder"]     // any of: ${PERSON_ROLES.join(', ')}
    }
  ],
  "horses": [
    {
      "barn_name":         "<required>",
      "registered_name":   null,
      "breed":             null,
      "color":             null,
      "gender":            null,            // free text: Mare | Gelding | Stallion | Colt | Filly
      "date_of_birth":     null,            // "YYYY-MM-DD" or null
      "height":            null,            // number, hands (e.g. 16.2)
      "weight":            null,            // number, lbs
      "microchip":         null,
      "status":            "active",        // ${HORSE_STATUSES.join(' | ')} — default active
      "notes":             null,
      "ownership_notes":   null,
      "turnout_notes":     null,
      "solo_turnout":      false,
      "lesson_horse":      false,
      "contacts": [
        {
          "person_ref":                    "<a _ref from people above>",
          "role":                          "Owner",
          "is_billing_contact":            true,
          "can_log_in":                    false,
          "can_log_services":              false,
          "receives_health_alerts":        false,
          "receives_lesson_notifications": false
        }
      ]
    }
  ]
}`
}

function rules(): string {
  return `MAPPING RULES

1. Every person gets a unique "_ref" slug — kebab-case, stable, human-readable. Use first-last by default (e.g. "jane-smith"). If names collide, disambiguate with middle initial or a suffix ("jane-smith-2").

2. Horse "contacts" reference people by their _ref. Every person_ref you use must match a _ref in the "people" array of the same payload.

3. Default the primary owner to is_billing_contact: true. If there are co-owners, leave is_billing_contact: false unless the source data specifies otherwise.

3a. IMPORTANT — CHIA distinguishes two senses of "owner":
    - The PERSON ROLE for someone whose horse lives at the barn is "boarder" (not "owner"). Use "boarder" in the roles array.
    - Legal ownership details live on horse_contact.role as a display label — use "Owner", "Co-Owner", "Lessor", etc. there.
    So a typical primary owner record looks like: person roles ["boarder"], horse contact role "Owner".

4. If a horse has multiple owners in the source, create one contact entry per owner. Role labels ("Owner", "Co-Owner", "Lessor", "Trainer") are display strings — match what the source uses.

5. Include every person referenced by any horse, even if they don't have their own role in the system. An owner who is only an owner still needs a person record with roles: ["owner"].

6. Minors (under 18) need guardian_ref pointing to another person's _ref. If the source doesn't indicate who the guardian is, ASK before producing the JSON.

7. Organizations (farms, LLCs) use is_organization: true + organization_name. first_name/last_name can be a contact person at the org.

8. Status defaults to "active" for currently-present horses, "archived" for horses that have left. "pending" = not yet arrived; "away" = temporarily off-property.

9. If a field isn't present in the source, set it to null (or false for booleans). Do not invent values. Do not guess dates.

10. Notes are free text — preserve the original wording, collapse multiple note fields into one with line breaks.`
}

function closing(): string {
  return `OUTPUT

Return a single JSON code block containing the full { people, horses } object, ready to paste into CHIA's migrate tool. After the code block, list any assumptions you made and any records you skipped or flagged for manual review.

Now, paste the raw source JSON and I'll remap it.`
}
