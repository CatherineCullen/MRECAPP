/**
 * Whitelisted schema catalog for AI Query.
 *
 * This is the security boundary. The validator only permits queries against
 * tables, columns, and relationships listed here. Add a table or column here
 * only after confirming no sensitive field (Stripe IDs, auth tokens,
 * signatures) is exposed to the query result.
 *
 * Keep in sync with migrations: when a new table or column becomes genuinely
 * useful for admin questions, add it here and regenerate the prompt by
 * visiting /chia/data/query — the live prompt reflects this file.
 *
 * Omissions are intentional:
 *   - billing_line_item / billing_line_item_allocation — internal plumbing
 *   - barn_calendar_day, provider_qr_code, enrollment_token — operational only
 *   - custom_field_definition, document_template, import_prompt — config
 *   - notification_preference — user settings
 *   - instructor_availability — use lesson-derived questions instead
 *   - auth.users, raw Stripe FK columns — never whitelisted
 */

export type ColumnType =
  | 'string' | 'text' | 'number' | 'boolean'
  | 'date'   | 'timestamp' | 'uuid' | 'enum'

export type ColumnDef = {
  name:     string
  type:     ColumnType
  nullable: boolean
  enumValues?: string[]
  note?:    string
}

export type RelationDef = {
  /** Alias name to use in JSON spec for the embed, e.g. "riders" */
  alias:         string
  /** Target table (must also be whitelisted) */
  table:         string
  /** Supabase FK constraint name, e.g. "lesson_rider_lesson_id_fkey" */
  fkConstraint:  string
  /** 'one' for parent (horse → owner), 'many' for children (horse → lessons) */
  kind:          'one' | 'many'
  note?:         string
}

export type TableDef = {
  name:         string
  description:  string
  columns:      ColumnDef[]
  relations:    RelationDef[]
}

// Reusable column fragments
const ID: ColumnDef        = { name: 'id',         type: 'uuid', nullable: false }
const CREATED: ColumnDef   = { name: 'created_at', type: 'timestamp', nullable: false }
const DELETED: ColumnDef   = { name: 'deleted_at', type: 'timestamp', nullable: true, note: 'Soft-delete marker. Queries auto-filter deleted_at IS NULL unless you explicitly opt in.' }

export const SCHEMA: TableDef[] = [
  {
    name: 'horse',
    description: 'Horses at the barn. Core record for boarding, lessons, training.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'barn_name',    type: 'string', nullable: false },
      { name: 'show_name',    type: 'string', nullable: true },
      { name: 'breed',        type: 'string', nullable: true },
      { name: 'color',        type: 'string', nullable: true },
      { name: 'sex',          type: 'enum',   nullable: true, enumValues: ['mare', 'gelding', 'stallion'] },
      { name: 'date_of_birth',type: 'date',   nullable: true },
      { name: 'status',       type: 'enum',   nullable: false, enumValues: ['pending', 'active', 'away', 'archived'] },
      { name: 'arrived_on',   type: 'date',   nullable: true },
      { name: 'notes',        type: 'text',   nullable: true },
    ],
    relations: [
      { alias: 'contacts',      table: 'horse_contact', fkConstraint: 'horse_contact_horse_id_fkey',  kind: 'many' },
      { alias: 'coggins',       table: 'coggins',       fkConstraint: 'coggins_horse_id_fkey',         kind: 'many' },
      { alias: 'health_records',table: 'health_record', fkConstraint: 'health_record_horse_id_fkey',  kind: 'many' },
      { alias: 'diet_records',  table: 'diet_record',   fkConstraint: 'diet_record_horse_id_fkey',    kind: 'many' },
      { alias: 'care_plans',    table: 'care_plan',     fkConstraint: 'care_plan_horse_id_fkey',      kind: 'many' },
      { alias: 'vet_visits',    table: 'vet_visit',     fkConstraint: 'vet_visit_horse_id_fkey',      kind: 'many' },
      { alias: 'service_logs',  table: 'board_service_log', fkConstraint: 'board_service_log_horse_id_fkey', kind: 'many' },
      { alias: 'training_rides',table: 'training_ride', fkConstraint: 'training_ride_horse_id_fkey',  kind: 'many' },
    ],
  },
  {
    name: 'person',
    description: 'People: riders, owners, staff, instructors, guardians, organizations.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'first_name',         type: 'string', nullable: true },
      { name: 'last_name',          type: 'string', nullable: true },
      { name: 'preferred_name',     type: 'string', nullable: true },
      { name: 'email',              type: 'string', nullable: true },
      { name: 'phone',              type: 'string', nullable: true },
      { name: 'is_minor',           type: 'boolean', nullable: false },
      { name: 'is_organization',    type: 'boolean', nullable: false },
      { name: 'organization_name',  type: 'string', nullable: true },
      { name: 'guardian_id',        type: 'uuid', nullable: true, note: 'FK to person for minors' },
      { name: 'is_training_ride_provider', type: 'boolean', nullable: false },
      { name: 'enrolled_at',        type: 'date', nullable: true },
    ],
    relations: [
      { alias: 'roles',             table: 'person_role',         fkConstraint: 'person_role_person_id_fkey', kind: 'many' },
      { alias: 'horse_contacts',    table: 'horse_contact',       fkConstraint: 'horse_contact_person_id_fkey', kind: 'many' },
      { alias: 'subscriptions',     table: 'lesson_subscription', fkConstraint: 'lesson_subscription_rider_id_fkey', kind: 'many' },
      { alias: 'makeup_tokens',     table: 'makeup_token',        fkConstraint: 'makeup_token_rider_id_fkey', kind: 'many' },
    ],
  },
  {
    name: 'person_role',
    description: 'Role assignments per person. One person can hold multiple roles.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'person_id', type: 'uuid', nullable: false },
      { name: 'role',      type: 'enum', nullable: false, enumValues: ['admin', 'instructor', 'barn_worker', 'rider', 'owner', 'lessor', 'service_provider'] },
    ],
    relations: [],
  },
  {
    name: 'horse_contact',
    description: 'Links a person to a horse with a role + permission flags.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'horse_id',           type: 'uuid', nullable: false },
      { name: 'person_id',          type: 'uuid', nullable: false },
      { name: 'role',               type: 'string', nullable: true },
      { name: 'is_billing_contact', type: 'boolean', nullable: false },
      { name: 'is_emergency_contact', type: 'boolean', nullable: false },
    ],
    relations: [
      { alias: 'horse',  table: 'horse',  fkConstraint: 'horse_contact_horse_id_fkey',  kind: 'one' },
      { alias: 'person', table: 'person', fkConstraint: 'horse_contact_person_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'lesson',
    description: 'Individual lessons. One row per timeslot. Riders attach via lesson_rider.',
    columns: [
      ID, CREATED,
      { name: 'scheduled_at',       type: 'timestamp', nullable: false },
      { name: 'duration_minutes',   type: 'number',    nullable: false, note: 'Generated column — derived from lesson_type.' },
      { name: 'instructor_id',      type: 'uuid',      nullable: true },
      { name: 'lesson_type',        type: 'enum',      nullable: false, enumValues: ['private', 'semi_private', 'group'] },
      { name: 'status',             type: 'enum',      nullable: false, enumValues: ['scheduled', 'completed', 'cancelled'] },
      { name: 'cancelled_at',       type: 'timestamp', nullable: true },
      { name: 'cancelled_by_id',    type: 'uuid',      nullable: true },
      { name: 'cancellation_reason',type: 'text',      nullable: true },
      { name: 'is_makeup',          type: 'boolean',   nullable: false },
      { name: 'makeup_for_lesson_id', type: 'uuid',    nullable: true },
      { name: 'notes',              type: 'text',      nullable: true },
    ],
    relations: [
      { alias: 'instructor', table: 'person',        fkConstraint: 'lesson_instructor_id_fkey', kind: 'one' },
      { alias: 'riders',     table: 'lesson_rider',  fkConstraint: 'lesson_rider_lesson_id_fkey', kind: 'many' },
    ],
  },
  {
    name: 'lesson_rider',
    description: 'Junction between lesson and rider. Carries the rider, their horse, and their subscription for that lesson.',
    columns: [
      ID, CREATED,
      { name: 'lesson_id',       type: 'uuid', nullable: false },
      { name: 'rider_id',        type: 'uuid', nullable: false },
      { name: 'horse_id',        type: 'uuid', nullable: true },
      { name: 'subscription_id', type: 'uuid', nullable: true },
      { name: 'package_id',      type: 'uuid', nullable: true },
      { name: 'cancelled_at',    type: 'timestamp', nullable: true },
      { name: 'cancelled_by_id', type: 'uuid', nullable: true },
    ],
    relations: [
      { alias: 'lesson',       table: 'lesson',              fkConstraint: 'lesson_rider_lesson_id_fkey', kind: 'one' },
      { alias: 'rider',        table: 'person',              fkConstraint: 'lesson_rider_rider_id_fkey', kind: 'one' },
      { alias: 'horse',        table: 'horse',               fkConstraint: 'lesson_rider_horse_id_fkey', kind: 'one' },
      { alias: 'subscription', table: 'lesson_subscription', fkConstraint: 'lesson_rider_subscription_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'lesson_subscription',
    description: 'Quarterly recurring weekly slot. One row per rider per quarter per slot.',
    columns: [
      ID, CREATED,
      { name: 'rider_id',        type: 'uuid', nullable: false },
      { name: 'quarter_id',      type: 'uuid', nullable: false },
      { name: 'day_of_week',     type: 'enum', nullable: false, enumValues: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] },
      { name: 'time_of_day',     type: 'string', nullable: false, note: 'e.g. "16:00"' },
      { name: 'instructor_id',   type: 'uuid', nullable: true },
      { name: 'price',           type: 'number', nullable: true },
      { name: 'subscription_type', type: 'enum', nullable: false, enumValues: ['standard', 'boarder'] },
      { name: 'status',          type: 'enum', nullable: false, enumValues: ['pending', 'confirmed', 'cancelled'] },
      { name: 'billed_to_id',    type: 'uuid', nullable: true },
    ],
    relations: [
      { alias: 'rider',      table: 'person',  fkConstraint: 'lesson_subscription_rider_id_fkey', kind: 'one' },
      { alias: 'quarter',    table: 'quarter', fkConstraint: 'lesson_subscription_quarter_id_fkey', kind: 'one' },
      { alias: 'instructor', table: 'person',  fkConstraint: 'lesson_subscription_instructor_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'lesson_package',
    description: 'One-off lesson products: evaluations, extras, birthday parties.',
    columns: [
      ID, CREATED,
      { name: 'rider_id',       type: 'uuid',   nullable: false },
      { name: 'product_type',   type: 'enum',   nullable: false, enumValues: ['evaluation', 'extra_lesson', 'birthday_party', 'event', 'other'] },
      { name: 'price',          type: 'number', nullable: true },
      { name: 'notes',          type: 'text',   nullable: true },
      { name: 'invoice_id',     type: 'uuid',   nullable: true },
    ],
    relations: [
      { alias: 'rider',   table: 'person',  fkConstraint: 'lesson_package_rider_id_fkey', kind: 'one' },
      { alias: 'invoice', table: 'invoice', fkConstraint: 'lesson_package_invoice_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'makeup_token',
    description: 'Tokens for makeup lessons. Available → Scheduled → Used or Expired.',
    columns: [
      ID, CREATED,
      { name: 'rider_id',             type: 'uuid', nullable: false },
      { name: 'quarter_id',           type: 'uuid', nullable: false },
      { name: 'status',               type: 'enum', nullable: false, enumValues: ['available', 'scheduled', 'used', 'expired'] },
      { name: 'reason',               type: 'enum', nullable: false, enumValues: ['rider_cancel', 'barn_cancel', 'admin_grant'] },
      { name: 'grant_reason',         type: 'text', nullable: true },
      { name: 'notes',                type: 'text', nullable: true },
      { name: 'official_expires_at',  type: 'timestamp', nullable: true },
      { name: 'original_lesson_id',   type: 'uuid', nullable: true },
      { name: 'scheduled_lesson_id',  type: 'uuid', nullable: true },
    ],
    relations: [
      { alias: 'rider',   table: 'person',  fkConstraint: 'makeup_token_rider_id_fkey', kind: 'one' },
      { alias: 'quarter', table: 'quarter', fkConstraint: 'makeup_token_quarter_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'training_ride',
    description: 'Training rides. Single-table entity: Scheduled → Logged.',
    columns: [
      ID, CREATED,
      { name: 'horse_id',     type: 'uuid', nullable: false },
      { name: 'provider_id',  type: 'uuid', nullable: false },
      { name: 'scheduled_at', type: 'timestamp', nullable: true },
      { name: 'logged_at',    type: 'timestamp', nullable: true },
      { name: 'status',       type: 'enum', nullable: false, enumValues: ['scheduled', 'logged', 'cancelled'] },
      { name: 'rate',         type: 'number', nullable: true },
      { name: 'notes',        type: 'text', nullable: true },
      { name: 'billing_skipped_at', type: 'timestamp', nullable: true },
    ],
    relations: [
      { alias: 'horse',    table: 'horse',  fkConstraint: 'training_ride_horse_id_fkey', kind: 'one' },
      { alias: 'provider', table: 'person', fkConstraint: 'training_ride_provider_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'board_service_log',
    description: 'Logged a la carte barn services. Entered via QR or app.',
    columns: [
      ID, CREATED,
      { name: 'horse_id',        type: 'uuid', nullable: false },
      { name: 'service_id',      type: 'uuid', nullable: false },
      { name: 'logged_at',       type: 'timestamp', nullable: false },
      { name: 'logged_by_label', type: 'string', nullable: true },
      { name: 'log_source',      type: 'enum', nullable: false, enumValues: ['qr_code', 'app', 'admin'] },
      { name: 'unit_price',      type: 'number', nullable: true },
      { name: 'is_billable',     type: 'boolean', nullable: false },
      { name: 'status',          type: 'enum', nullable: false, enumValues: ['logged', 'pending_review', 'reviewed', 'invoiced', 'voided'] },
      { name: 'void_reason',     type: 'text', nullable: true },
      { name: 'voided_at',       type: 'timestamp', nullable: true },
      { name: 'notes',           type: 'text', nullable: true },
    ],
    relations: [
      { alias: 'horse',   table: 'horse',         fkConstraint: 'board_service_log_horse_id_fkey', kind: 'one' },
      { alias: 'service', table: 'board_service', fkConstraint: 'board_service_log_service_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'board_service',
    description: 'Catalog of a la carte services (wrapping, groom, bath, etc.).',
    columns: [
      ID, CREATED, DELETED,
      { name: 'name',        type: 'string', nullable: false },
      { name: 'unit_price',  type: 'number', nullable: true },
      { name: 'is_billable', type: 'boolean', nullable: false },
      { name: 'is_active',   type: 'boolean', nullable: false },
    ],
    relations: [],
  },
  {
    name: 'invoice',
    description: 'Invoices. Created from board, training rides, lesson subscriptions, and one-off products.',
    columns: [
      ID, CREATED,
      { name: 'billed_to_id',   type: 'uuid', nullable: false },
      { name: 'period_start',   type: 'date', nullable: true },
      { name: 'period_end',     type: 'date', nullable: true },
      { name: 'due_date',       type: 'date', nullable: true },
      { name: 'total_cents',    type: 'number', nullable: false },
      { name: 'status',         type: 'enum', nullable: false, enumValues: ['draft', 'open', 'paid', 'void', 'uncollectible'] },
      { name: 'sent_at',        type: 'timestamp', nullable: true },
      { name: 'paid_at',        type: 'timestamp', nullable: true },
      { name: 'invoice_kind',   type: 'enum', nullable: true, enumValues: ['board', 'lesson_subscription', 'one_off', 'camp'] },
    ],
    relations: [
      { alias: 'billed_to', table: 'person',            fkConstraint: 'invoice_billed_to_id_fkey', kind: 'one' },
      { alias: 'lines',     table: 'invoice_line_item', fkConstraint: 'invoice_line_item_invoice_id_fkey', kind: 'many' },
    ],
  },
  {
    name: 'invoice_line_item',
    description: 'Individual lines on invoices, each with an explicit source FK (per ADR-0010).',
    columns: [
      ID, CREATED,
      { name: 'invoice_id',            type: 'uuid', nullable: false },
      { name: 'description',           type: 'string', nullable: false },
      { name: 'quantity',              type: 'number', nullable: false },
      { name: 'unit_price_cents',      type: 'number', nullable: false },
      { name: 'total_cents',           type: 'number', nullable: false },
      { name: 'board_service_log_id',  type: 'uuid', nullable: true },
      { name: 'training_ride_id',      type: 'uuid', nullable: true },
      { name: 'lesson_subscription_id',type: 'uuid', nullable: true },
      { name: 'camp_enrollment_id',    type: 'uuid', nullable: true },
      { name: 'lesson_package_id',     type: 'uuid', nullable: true },
      { name: 'horse_id',              type: 'uuid', nullable: true },
    ],
    relations: [
      { alias: 'invoice', table: 'invoice', fkConstraint: 'invoice_line_item_invoice_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'coggins',
    description: 'Coggins test records. Legally required, must have a PDF.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'horse_id',       type: 'uuid', nullable: false },
      { name: 'drawn_on',       type: 'date', nullable: false },
      { name: 'expires_on',     type: 'date', nullable: false },
      { name: 'vet_name',       type: 'string', nullable: true },
      { name: 'lab_name',       type: 'string', nullable: true },
      { name: 'accession_number', type: 'string', nullable: true },
      { name: 'result',         type: 'enum', nullable: true, enumValues: ['negative', 'positive'] },
    ],
    relations: [
      { alias: 'horse', table: 'horse', fkConstraint: 'coggins_horse_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'health_record',
    description: 'Vaccines, fecals, dental, Adequan — recurring health events per horse.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'horse_id',          type: 'uuid', nullable: false },
      { name: 'health_item_type_id', type: 'uuid', nullable: false },
      { name: 'performed_on',      type: 'date', nullable: false },
      { name: 'next_due_on',       type: 'date', nullable: true },
      { name: 'performed_by',      type: 'string', nullable: true },
      { name: 'notes',             type: 'text', nullable: true },
    ],
    relations: [
      { alias: 'horse',     table: 'horse',             fkConstraint: 'health_record_horse_id_fkey', kind: 'one' },
      { alias: 'item_type', table: 'health_item_type',  fkConstraint: 'health_record_health_item_type_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'health_item_type',
    description: 'Catalog of recurring health items (vaccine types, dental, etc.).',
    columns: [
      ID, CREATED,
      { name: 'name',         type: 'string',  nullable: false },
      { name: 'is_essential', type: 'boolean', nullable: false },
      { name: 'is_active',    type: 'boolean', nullable: false },
      { name: 'default_interval_months', type: 'number', nullable: true },
    ],
    relations: [],
  },
  {
    name: 'care_plan',
    description: 'Temporary care plans on a horse (stall rest, bute course, etc.). Versioned via supersession.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'horse_id',    type: 'uuid', nullable: false },
      { name: 'starts_on',   type: 'date', nullable: true },
      { name: 'ends_on',     type: 'date', nullable: true },
      { name: 'content',     type: 'text', nullable: false },
      { name: 'resolved_at', type: 'timestamp', nullable: true },
      { name: 'superseded_by_id', type: 'uuid', nullable: true },
    ],
    relations: [
      { alias: 'horse', table: 'horse', fkConstraint: 'care_plan_horse_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'vet_visit',
    description: 'Vet visit PDFs with AI-extracted metadata.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'horse_id',  type: 'uuid', nullable: false },
      { name: 'visited_on',type: 'date', nullable: false },
      { name: 'vet_name',  type: 'string', nullable: true },
      { name: 'summary',   type: 'text', nullable: true },
    ],
    relations: [
      { alias: 'horse', table: 'horse', fkConstraint: 'vet_visit_horse_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'diet_record',
    description: 'Current and historical diet for each horse.',
    columns: [
      ID, CREATED, DELETED,
      { name: 'horse_id',    type: 'uuid', nullable: false },
      { name: 'starts_on',   type: 'date', nullable: true },
      { name: 'ends_on',     type: 'date', nullable: true },
      { name: 'content',     type: 'text', nullable: false },
      { name: 'superseded_by_id', type: 'uuid', nullable: true },
    ],
    relations: [
      { alias: 'horse', table: 'horse', fkConstraint: 'diet_record_horse_id_fkey', kind: 'one' },
    ],
  },
  {
    name: 'quarter',
    description: 'Lesson quarters. Ties subscriptions and makeup tokens to a billing period.',
    columns: [
      ID, CREATED,
      { name: 'label',      type: 'string', nullable: false, note: 'e.g. "Spring 2026"' },
      { name: 'start_date', type: 'date', nullable: false },
      { name: 'end_date',   type: 'date', nullable: false },
    ],
    relations: [],
  },
]

/** Quick lookup helpers. */
export function getTable(name: string): TableDef | undefined {
  return SCHEMA.find(t => t.name === name)
}

export function tableNames(): string[] {
  return SCHEMA.map(t => t.name)
}
