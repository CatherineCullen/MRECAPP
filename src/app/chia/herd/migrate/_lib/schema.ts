/**
 * Migration import shape — the JSON the admin pastes into the migrate tool.
 *
 * This is CHIA-schema-aligned, not source-system-shaped. Catherine does the
 * mapping step outside the tool (ask Claude to remap the raw source capture
 * to match this shape), and the tool only has to deal with clean input.
 *
 * The tool is deliberately throw-away — used for initial migration of ~26
 * horses and ~26 owners, plus a later ~200 lesson riders. Keep it simple.
 */

// DB enum: person_role_type. Note 'boarder' (not 'owner') — renamed in
// migration 20260416000003 to reflect "has a horse at this barn" rather than
// legal ownership (which lives on horse_contact.role as a display label).
export type PersonRoleType =
  | 'rider' | 'boarder' | 'instructor' | 'admin'
  | 'barn_owner' | 'barn_worker' | 'service_provider'

export const PERSON_ROLES: PersonRoleType[] = [
  'rider', 'boarder', 'instructor', 'admin', 'barn_owner', 'barn_worker', 'service_provider',
]

export type HorseStatus = 'pending' | 'active' | 'away' | 'archived'
export const HORSE_STATUSES: HorseStatus[] = ['pending', 'active', 'away', 'archived']

export type WeightCategory = 'light' | 'medium' | 'heavy'
export const WEIGHT_CATEGORIES: WeightCategory[] = ['light', 'medium', 'heavy']

export type RidingLevel = 'beginner' | 'intermediate' | 'advanced'
export const RIDING_LEVELS: RidingLevel[] = ['beginner', 'intermediate', 'advanced']

export type PersonInput = {
  /** A slug the admin assigns so horses can reference this person. Must be unique within the payload. */
  _ref: string

  first_name: string
  last_name:  string

  preferred_name?:  string | null
  email?:           string | null
  phone?:           string | null
  address?:         string | null
  date_of_birth?:   string | null   // ISO 8601 date

  is_minor?:        boolean
  /** Another person's _ref. Required if is_minor. */
  guardian_ref?:    string | null

  is_organization?:     boolean
  /** Required if is_organization. */
  organization_name?:   string | null

  weight_category?: WeightCategory | null
  riding_level?:    RidingLevel    | null
  height?:          string | null
  usef_id?:         string | null

  is_training_ride_provider?: boolean
  provider_type?:             string | null

  notes?: string | null

  /** Roles to assign. Admin/barn_owner etc. can be included. */
  roles?: PersonRoleType[]
}

export type HorseContactInput = {
  person_ref: string
  role?:      string | null   // display label (Owner, Co-Owner, Lessor, etc.)
  is_billing_contact?:            boolean
  can_log_in?:                    boolean
  can_log_services?:              boolean
  receives_health_alerts?:        boolean
  receives_lesson_notifications?: boolean
}

export type HorseInput = {
  barn_name:        string
  registered_name?: string | null
  breed?:           string | null
  color?:           string | null
  gender?:          string | null
  date_of_birth?:   string | null   // ISO 8601 date
  height?:          number | null   // hands
  weight?:          number | null   // lbs
  microchip?:       string | null
  stall?:           string | null
  status?:          HorseStatus     // default 'active' on import
  notes?:           string | null
  ownership_notes?: string | null
  turnout_notes?:   string | null
  solo_turnout?:    boolean
  lesson_horse?:    boolean

  contacts?: HorseContactInput[]
}

export type MigrationInput = {
  people: PersonInput[]
  horses: HorseInput[]
}

export type ValidationError = {
  path:    string
  message: string
  hint?:   string
}

export type ValidationSummary = {
  peopleCount:   number
  horsesCount:   number
  contactsCount: number
  rolesCount:    number
}

export type ValidationResult =
  | { ok: true;  summary: ValidationSummary; normalized: MigrationInput }
  | { ok: false; errors: ValidationError[] }
