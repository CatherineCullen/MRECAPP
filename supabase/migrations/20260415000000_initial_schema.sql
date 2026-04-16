-- ============================================================
-- CHIA Barn Management — Initial Schema
-- Migration: 20260415000000_initial_schema
-- ============================================================
-- Conventions:
--   - All tables use soft deletes (deleted_at timestamp)
--   - All tables have created_at, updated_at
--   - Enums for fixed value sets; strings for extensible sets
--   - Computed fields are views or generated columns, never stored
--   - Filter WHERE deleted_at IS NULL for all active-record queries
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE horse_status AS ENUM ('pending', 'active', 'away', 'archived');

CREATE TYPE person_weight_category AS ENUM ('light', 'medium', 'heavy');

CREATE TYPE person_riding_level AS ENUM ('beginner', 'intermediate', 'advanced');

CREATE TYPE person_preferred_language AS ENUM ('english', 'spanish');

CREATE TYPE person_role_type AS ENUM (
  'rider', 'owner', 'instructor', 'admin', 'barn_owner', 'barn_worker', 'service_provider'
);

CREATE TYPE day_of_week AS ENUM (
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
);

CREATE TYPE lesson_subscription_type AS ENUM ('standard', 'boarder');

CREATE TYPE lesson_subscription_status AS ENUM ('pending', 'active', 'cancelled', 'completed');

CREATE TYPE renewal_intent AS ENUM ('renewing', 'not_renewing');

-- lesson_type is stored and recalculated from active LessonRider count.
-- NEVER set manually except via the recalculation function. See ADR-0009.
CREATE TYPE lesson_type AS ENUM ('private', 'semi_private', 'group');

CREATE TYPE lesson_status AS ENUM (
  'pending', 'scheduled', 'completed', 'cancelled_rider', 'cancelled_barn', 'no_show'
);

CREATE TYPE makeup_token_reason AS ENUM ('rider_cancel', 'barn_cancel', 'admin_grant');

CREATE TYPE makeup_token_status AS ENUM ('available', 'scheduled', 'used', 'expired');

CREATE TYPE training_ride_status AS ENUM ('scheduled', 'logged');

CREATE TYPE board_service_log_status AS ENUM (
  'logged', 'pending_review', 'reviewed', 'invoiced', 'voided'
);

CREATE TYPE log_source AS ENUM ('app', 'qr_code', 'admin');

CREATE TYPE horse_event_type AS ENUM (
  'lesson', 'training_ride', 'medication', 'lunge', 'treatment', 'board_service', 'vet_visit', 'other'
);

CREATE TYPE notification_type AS ENUM (
  'lesson_reminder', 'lesson_cancellation', 'lesson_confirmation',
  'lesson_type_change', 'health_alert', 'invoice', 'makeup_token', 'renewal_notice'
);

CREATE TYPE notification_channel AS ENUM ('email', 'sms');

CREATE TYPE invoice_status AS ENUM (
  'draft', 'pending_review', 'sent', 'opened', 'paid', 'overdue'
);

CREATE TYPE invoice_line_item_type AS ENUM ('standard', 'adjustment', 'credit');

CREATE TYPE billing_line_item_status AS ENUM ('draft', 'reviewed');

CREATE TYPE camp_enrollment_status AS ENUM ('enrolled', 'waitlisted', 'cancelled');

CREATE TYPE camp_session_status AS ENUM ('open', 'closed', 'cancelled');

CREATE TYPE custom_field_entity_type AS ENUM ('horse', 'person');

CREATE TYPE custom_field_field_type AS ENUM ('text', 'number', 'date', 'boolean');

CREATE TYPE custom_field_visibility_tier AS ENUM ('always', 'collapsible', 'internal_only');

CREATE TYPE custom_field_section AS ENUM ('identity', 'daily_care', 'health', 'scheduling', 'admin');


-- ============================================================
-- HORSE
-- Core horse record.
-- ============================================================

CREATE TABLE horse (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_name             text NOT NULL,
  registered_name       text,
  height                numeric(4,1),           -- hands
  weight                integer,                -- lbs, estimated
  color                 text,
  breed                 text,
  gender                text,                   -- free text: Mare, Gelding, Stallion, Colt, Filly
  microchip             text,
  stall                 text,                   -- stall number or location
  date_of_birth         date,
  status                horse_status NOT NULL DEFAULT 'pending',
  status_reason         text,
  status_changed_at     timestamptz,
  notes                 text,
  custom_fields         jsonb DEFAULT '{}'::jsonb,
  lesson_horse          boolean NOT NULL DEFAULT false,
  solo_turnout          boolean NOT NULL DEFAULT false,
  turnout_notes         text,
  ownership_notes       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz             -- soft delete
);

CREATE INDEX horse_status_idx ON horse(status) WHERE deleted_at IS NULL;
CREATE INDEX horse_deleted_at_idx ON horse(deleted_at);


-- ============================================================
-- PERSON
-- Every individual in the system.
-- auth_user_id links to Supabase Auth — required for all RLS.
-- ============================================================

CREATE TABLE person (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name                text NOT NULL,
  last_name                 text NOT NULL,
  preferred_name            text,
  email                     text,               -- required for anyone with app login
  phone                     text,
  address                   text,
  date_of_birth             date,
  weight_category           person_weight_category,
  riding_level              person_riding_level,  -- admin-only, not shown to riders
  height                    text,
  is_minor                  boolean NOT NULL DEFAULT false,
  guardian_id               uuid REFERENCES person(id),
  preferred_language        person_preferred_language NOT NULL DEFAULT 'english',
  usef_id                   text,
  is_organization           boolean NOT NULL DEFAULT false,
  organization_name         text,               -- populated when is_organization = true
  provider_type             text,               -- e.g., Farrier, Chiropractor — Service Provider role only
  is_training_ride_provider boolean NOT NULL DEFAULT false,
  notes                     text,
  ical_token                uuid UNIQUE,        -- private iCal feed token, generated on demand
  auth_user_id              uuid UNIQUE,        -- FK to auth.users — null for minors and non-login contacts
  custom_fields             jsonb DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

-- Constraint: minors must have a guardian
ALTER TABLE person ADD CONSTRAINT minor_requires_guardian
  CHECK (NOT is_minor OR guardian_id IS NOT NULL);

-- Constraint: organizations must have an organization_name
ALTER TABLE person ADD CONSTRAINT org_requires_name
  CHECK (NOT is_organization OR organization_name IS NOT NULL);

CREATE INDEX person_auth_user_id_idx ON person(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX person_email_idx ON person(email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX person_guardian_id_idx ON person(guardian_id) WHERE guardian_id IS NOT NULL;
CREATE INDEX person_deleted_at_idx ON person(deleted_at);
CREATE INDEX person_training_ride_provider_idx ON person(is_training_ride_provider) WHERE is_training_ride_provider = true AND deleted_at IS NULL;


-- ============================================================
-- PERSON ROLE
-- Join table — one row per role per person.
-- People can hold multiple roles simultaneously. See ADR-0001.
-- ============================================================

CREATE TABLE person_role (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES person(id),
  role        person_role_type NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES person(id),
  deleted_at  timestamptz       -- soft delete — for role removal
);

-- A person should not hold the same role twice (active records only).
CREATE UNIQUE INDEX person_role_unique_active
  ON person_role(person_id, role)
  WHERE deleted_at IS NULL;

CREATE INDEX person_role_person_id_idx ON person_role(person_id) WHERE deleted_at IS NULL;
CREATE INDEX person_role_role_idx ON person_role(role) WHERE deleted_at IS NULL;


-- ============================================================
-- NOTIFICATION PREFERENCE
-- Per-person, per-type, per-channel opt-out settings.
-- ============================================================

CREATE TABLE notification_preference (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid NOT NULL REFERENCES person(id),
  notification_type notification_type NOT NULL,
  channel           notification_channel NOT NULL,
  opted_out         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES person(id),
  deleted_at        timestamptz
);

-- One preference record per person per type per channel
CREATE UNIQUE INDEX notification_preference_unique
  ON notification_preference(person_id, notification_type, channel)
  WHERE deleted_at IS NULL;


-- ============================================================
-- HORSE CONTACT
-- People attached to a horse. Replaces the OwnerGroup model.
-- Billing contacts identified by is_billing_contact flag.
-- ============================================================

CREATE TABLE horse_contact (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id                    uuid NOT NULL REFERENCES horse(id),
  person_id                   uuid NOT NULL REFERENCES person(id),
  role                        text,             -- display label only: Owner, Co-Owner, Lessor, etc.
  can_log_in                  boolean NOT NULL DEFAULT false,
  can_log_services            boolean NOT NULL DEFAULT false,
  receives_health_alerts      boolean NOT NULL DEFAULT false,
  receives_lesson_notifications boolean NOT NULL DEFAULT false,
  is_billing_contact          boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz
);

-- A person should appear on a horse's contact list only once (active records)
CREATE UNIQUE INDEX horse_contact_unique_active
  ON horse_contact(horse_id, person_id)
  WHERE deleted_at IS NULL;

CREATE INDEX horse_contact_horse_id_idx ON horse_contact(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX horse_contact_person_id_idx ON horse_contact(person_id) WHERE deleted_at IS NULL;
CREATE INDEX horse_contact_billing_idx ON horse_contact(horse_id, is_billing_contact) WHERE is_billing_contact = true AND deleted_at IS NULL;


-- ============================================================
-- HORSE RECORDING IDS
-- Optional registration fields. Hidden by default in UI.
-- ============================================================

CREATE TABLE horse_recording_ids (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id                uuid NOT NULL UNIQUE REFERENCES horse(id),
  usef_id                 text,
  breed_recording_number  text,
  passport_number         text,
  additional_ids          jsonb DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);


-- ============================================================
-- DOCUMENT
-- Any uploaded file — waivers, agreements, Coggins PDFs, etc.
-- document_type is a string (not enum) — new types don't need migrations.
-- ============================================================

CREATE TABLE document (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid REFERENCES person(id),
  horse_id      uuid REFERENCES horse(id),
  document_type text NOT NULL,                  -- Waiver, Boarding Agreement, Coggins, Vet Record, etc.
  file_url      text NOT NULL,                  -- storage path
  filename      text NOT NULL,
  uploaded_at   timestamptz NOT NULL,           -- when the doc was signed/created (may be backdated)
  uploaded_by   uuid REFERENCES person(id),
  signed_at     date,
  expires_at    date,                           -- null for Coggins (expiry on Coggins record); null for waivers
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES person(id),
  deleted_at    timestamptz                     -- soft delete — has_signed_waiver derived from WHERE deleted_at IS NULL
);

CREATE INDEX document_person_id_idx ON document(person_id) WHERE deleted_at IS NULL;
CREATE INDEX document_horse_id_idx ON document(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX document_type_idx ON document(document_type) WHERE deleted_at IS NULL;


-- ============================================================
-- COGGINS
-- A federal legal document. Separate entity — not a HealthEvent.
-- expiry_date is a generated column (draw + 1 year). See ADR re: Coggins.
-- ============================================================

CREATE TABLE coggins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id        uuid NOT NULL REFERENCES horse(id),
  date_drawn      date NOT NULL,
  expiry_date     date GENERATED ALWAYS AS (date_drawn + INTERVAL '1 year') STORED,
  vet_name        text,
  document_id     uuid NOT NULL REFERENCES document(id),
  created_by      uuid REFERENCES person(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX coggins_horse_id_idx ON coggins(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX coggins_expiry_date_idx ON coggins(expiry_date) WHERE deleted_at IS NULL;


-- ============================================================
-- LEASE
-- Records a lease arrangement for a horse.
-- ============================================================

CREATE TABLE lease (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id    uuid NOT NULL REFERENCES horse(id),
  lessee_id   uuid NOT NULL REFERENCES person(id),   -- the rider leasing the horse
  start_date  date NOT NULL,
  end_date    date,                                    -- null = open-ended lease
  document_id uuid REFERENCES document(id),
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES person(id),
  deleted_at  timestamptz
);

CREATE INDEX lease_horse_id_idx ON lease(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX lease_lessee_id_idx ON lease(lessee_id) WHERE deleted_at IS NULL;


-- ============================================================
-- DIET RECORD
-- Standing diet/supplement instructions. One active version per horse.
-- Prior versions are soft-deleted when a new record is created.
-- ============================================================

CREATE TABLE diet_record (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id            uuid NOT NULL REFERENCES horse(id),
  feed_instructions   text,
  supplements         text,
  notes               text,
  version             integer NOT NULL DEFAULT 1,
  created_by          uuid REFERENCES person(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz   -- null = active; prior versions soft-deleted when new record created
);

CREATE INDEX diet_record_horse_active_idx ON diet_record(horse_id) WHERE deleted_at IS NULL;


-- ============================================================
-- CARE PLAN
-- Situational instructions for a horse. Free-form.
-- Multiple can be active simultaneously. Versioned via linked records.
-- See ADR-0006.
-- ============================================================

CREATE TABLE care_plan (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id              uuid NOT NULL REFERENCES horse(id),
  content               text NOT NULL,
  starts_on             date,
  ends_on               date,
  version               integer NOT NULL DEFAULT 1,
  is_active             boolean NOT NULL DEFAULT true,
  source_vet_visit_id   uuid,                         -- FK to vet_visit added after that table is created
  source_quote          text,                         -- verbatim text from source doc
  previous_version_id   uuid REFERENCES care_plan(id),
  created_by            uuid REFERENCES person(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  resolved_at           timestamptz,
  resolved_by           uuid REFERENCES person(id),
  resolution_note       text
);

CREATE INDEX care_plan_horse_active_idx ON care_plan(horse_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX care_plan_horse_id_idx ON care_plan(horse_id) WHERE deleted_at IS NULL;


-- ============================================================
-- HEALTH ITEM TYPE
-- Admin-managed catalog of recurring health item types.
-- Drives herd health dashboard. See vet-records.md.
-- ============================================================

CREATE TABLE health_item_type (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  is_essential          boolean NOT NULL DEFAULT false,
  show_in_herd_dashboard boolean NOT NULL DEFAULT false,
  default_interval_days integer,
  notes                 text,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES person(id),
  deleted_at            timestamptz
);

CREATE UNIQUE INDEX health_item_type_name_unique
  ON health_item_type(lower(name))
  WHERE deleted_at IS NULL;


-- ============================================================
-- HEALTH PROGRAM ITEM
-- Per-horse recurring health schedule. One record per type per horse.
-- Updated each time that item is completed.
-- ============================================================

CREATE TABLE health_program_item (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id                uuid NOT NULL REFERENCES horse(id),
  health_item_type_id     uuid NOT NULL REFERENCES health_item_type(id),
  last_done               date,
  next_due                date,
  interval_override_days  integer,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES person(id),
  deleted_at              timestamptz
);

-- One record per horse per item type (active records only)
CREATE UNIQUE INDEX health_program_item_unique
  ON health_program_item(horse_id, health_item_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX health_program_item_next_due_idx ON health_program_item(next_due) WHERE deleted_at IS NULL;


-- ============================================================
-- HEALTH EVENT
-- Individual health administration or test result history.
-- Structured and queryable across horses.
-- ============================================================

CREATE TABLE health_event (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id                 uuid NOT NULL REFERENCES horse(id),
  health_item_type_id      uuid NOT NULL REFERENCES health_item_type(id),
  health_program_item_id   uuid REFERENCES health_program_item(id),
  item_name                text,               -- specific product/test name from the document
  administered_on          date NOT NULL,
  result                   text,               -- for tests (e.g., "150 EPG", "negative")
  next_due                 date,
  administered_by          text,               -- free text — vet name or "self"
  administered_by_person_id uuid REFERENCES person(id),
  lot_number               text,
  source_vet_visit_id      uuid,               -- FK to vet_visit added after that table is created
  document_id              uuid REFERENCES document(id),
  notes                    text,
  recorded_by              uuid REFERENCES person(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz         -- soft delete — health event history is otherwise immutable
);

CREATE INDEX health_event_horse_id_idx ON health_event(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX health_event_type_id_idx ON health_event(health_item_type_id) WHERE deleted_at IS NULL;
CREATE INDEX health_event_administered_on_idx ON health_event(administered_on) WHERE deleted_at IS NULL;


-- ============================================================
-- HEALTH RECORD
-- Ad hoc point-in-time observations (weight check, injury note, etc.)
-- Distinct from HealthEvent (structured recurring items) and VetVisit.
-- ============================================================

CREATE TABLE health_record (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id      uuid NOT NULL REFERENCES horse(id),
  record_type   text NOT NULL,                -- Weight Check, Injury Note, Observation, etc.
  value         text,
  notes         text,
  recorded_by   uuid REFERENCES person(id),  -- who made the observation
  recorded_at   timestamptz NOT NULL,         -- when the observation occurred (may differ from created_at)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES person(id),
  deleted_at    timestamptz
);

CREATE INDEX health_record_horse_id_idx ON health_record(horse_id) WHERE deleted_at IS NULL;


-- ============================================================
-- QUARTER
-- Admin-defined barn quarters. Authoritative reference for all date logic.
-- Never a free-form string anywhere in the system. See ADR-0002.
-- ============================================================

CREATE TABLE quarter (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,                  -- e.g., "Summer 2026"
  mr_year     integer NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES person(id),
  deleted_at  timestamptz
);

-- Only one active quarter at a time
CREATE UNIQUE INDEX quarter_active_unique
  ON quarter(is_active)
  WHERE is_active = true;

CREATE INDEX quarter_dates_idx ON quarter(start_date, end_date);


-- ============================================================
-- BARN CALENDAR DAY
-- Authoritative calendar. Defines closures and makeup window days.
-- ============================================================

CREATE TABLE barn_calendar_day (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL UNIQUE,
  quarter_id    uuid REFERENCES quarter(id),  -- null for future dates not yet assigned to a quarter
  barn_closed   boolean NOT NULL DEFAULT false,
  is_makeup_day boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX barn_calendar_quarter_idx ON barn_calendar_day(quarter_id);
CREATE INDEX barn_calendar_date_idx ON barn_calendar_day(date);


-- ============================================================
-- BOARD SERVICE
-- Service catalog — billable barn services and non-billable provider visits.
-- ============================================================

CREATE TABLE board_service (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  name_es               text,                  -- Phase 2 only — do not use in Phase 1 UI
  description           text,
  is_billable           boolean NOT NULL DEFAULT true,
  is_recurring_monthly  boolean NOT NULL DEFAULT false, -- Monthly Board flag
  unit_price            numeric(10,2),          -- null for non-billable services
  is_active             boolean NOT NULL DEFAULT true,
  qr_code_url           text,                  -- per-service QR code URL
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES person(id),
  deleted_at            timestamptz
);

-- Only one recurring monthly service
CREATE UNIQUE INDEX board_service_monthly_unique
  ON board_service(is_recurring_monthly)
  WHERE is_recurring_monthly = true AND deleted_at IS NULL;


-- ============================================================
-- PROVIDER QR CODE
-- Per-provider QR codes for external service providers.
-- Token in URL is the credential — no login required.
-- See ADR-0011.
-- ============================================================

CREATE TABLE provider_qr_code (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_person_id  uuid NOT NULL REFERENCES person(id),
  service_id          uuid NOT NULL REFERENCES board_service(id),
  token               text NOT NULL UNIQUE,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES person(id)
  -- no deleted_at: deactivation via is_active = false. Records kept for audit trail.
);

CREATE INDEX provider_qr_token_idx ON provider_qr_code(token) WHERE is_active = true;


-- ============================================================
-- HORSE EVENT
-- Unified chronology of everything that has happened with a horse.
-- ============================================================

CREATE TABLE horse_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id        uuid NOT NULL REFERENCES horse(id),
  event_type      horse_event_type NOT NULL,
  title           text,
  notes           text,
  scheduled_at    timestamptz,                -- null if logged with no prior plan entry
  recorded_at     timestamptz,               -- null if this is a plan-generated calendar entry
  recorded_by     uuid REFERENCES person(id),
  source_plan_id  uuid REFERENCES care_plan(id),
  board_service_id uuid REFERENCES board_service(id),
  lesson_id       uuid,                       -- FK to lesson added after that table is created
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX horse_event_horse_id_idx ON horse_event(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX horse_event_scheduled_at_idx ON horse_event(horse_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX horse_event_recorded_at_idx ON horse_event(horse_id, recorded_at) WHERE deleted_at IS NULL;
CREATE INDEX horse_event_type_idx ON horse_event(horse_id, event_type) WHERE deleted_at IS NULL;


-- ============================================================
-- BOARD SERVICE LOG
-- A recorded instance of a board service.
-- ============================================================

CREATE TABLE board_service_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id              uuid NOT NULL REFERENCES horse(id),
  service_id            uuid NOT NULL REFERENCES board_service(id),
  logged_by_id          uuid REFERENCES person(id),      -- null if QR without login
  logged_by_label       text,                            -- fallback: QR code name or provider name
  log_source            log_source NOT NULL,
  logged_at             timestamptz NOT NULL,             -- business timestamp (may be backdated)
  created_at            timestamptz NOT NULL DEFAULT now(),
  is_billable           boolean NOT NULL,                 -- snapshotted from BoardService.is_billable at log time
  unit_price            numeric(10,2),                   -- snapshotted from BoardService.unit_price at log time
  notes                 text,
  provider_qr_code_id   uuid REFERENCES provider_qr_code(id),
  status                board_service_log_status NOT NULL DEFAULT 'pending_review',
  reviewed_by           uuid REFERENCES person(id),
  reviewed_at           timestamptz,
  voided_by             uuid REFERENCES person(id),
  voided_at             timestamptz,
  void_reason           text,
  horse_event_id        uuid REFERENCES horse_event(id),
  invoice_line_item_id  uuid                              -- FK to invoice_line_item added after that table is created
);

-- Constraint: at least one of logged_by_id or logged_by_label must be set
ALTER TABLE board_service_log ADD CONSTRAINT log_attribution_required
  CHECK (logged_by_id IS NOT NULL OR logged_by_label IS NOT NULL);

CREATE INDEX board_service_log_horse_id_idx ON board_service_log(horse_id);
CREATE INDEX board_service_log_status_idx ON board_service_log(status);
CREATE INDEX board_service_log_service_id_idx ON board_service_log(service_id);


-- ============================================================
-- VET VISIT
-- Recorded veterinary visit. Source of truth for care plan updates.
-- ============================================================

CREATE TABLE vet_visit (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id                  uuid NOT NULL REFERENCES horse(id),
  visit_date                date NOT NULL,
  vet_name                  text,
  vet_practice              text,
  reason                    text,
  findings                  text,
  recommendations           text,               -- raw vet recommendations — source for care plan updates
  imported_from_document_id uuid REFERENCES document(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES person(id),
  deleted_at                timestamptz
);

CREATE INDEX vet_visit_horse_id_idx ON vet_visit(horse_id) WHERE deleted_at IS NULL;

-- Now add deferred FKs that depended on vet_visit
ALTER TABLE care_plan ADD CONSTRAINT care_plan_source_vet_visit_fk
  FOREIGN KEY (source_vet_visit_id) REFERENCES vet_visit(id);

ALTER TABLE health_event ADD CONSTRAINT health_event_source_vet_visit_fk
  FOREIGN KEY (source_vet_visit_id) REFERENCES vet_visit(id);


-- ============================================================
-- HORSE SCHEDULING NOTE
-- Short operational notes for instructors about a horse.
-- Admin-created; instructors can read but not create or close.
-- ============================================================

CREATE TABLE horse_scheduling_note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id    uuid NOT NULL REFERENCES horse(id),
  note        text NOT NULL,
  starts_on   date NOT NULL DEFAULT CURRENT_DATE,
  ends_on     date,                             -- null = indefinite, active until manually closed
  created_by  uuid REFERENCES person(id),      -- admin only
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz,                      -- normal resolution path
  closed_by   uuid REFERENCES person(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                       -- for notes created in error; distinct from closed_at
);

CREATE INDEX horse_scheduling_note_horse_idx ON horse_scheduling_note(horse_id) WHERE deleted_at IS NULL AND closed_at IS NULL;


-- ============================================================
-- INSTRUCTOR AVAILABILITY
-- Positive availability model — instructors declare when available.
-- ============================================================

CREATE TABLE instructor_availability (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid NOT NULL REFERENCES person(id),
  day_of_week     day_of_week NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  effective_from  date NOT NULL,
  effective_until date,                         -- null = ongoing
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES person(id),
  deleted_at      timestamptz
);

CREATE INDEX instructor_availability_person_idx ON instructor_availability(person_id) WHERE deleted_at IS NULL;


-- ============================================================
-- LESSON SUBSCRIPTION
-- A rider's quarterly subscription. Generates Lesson records.
-- subscription_price snapshotted at enrollment — never changes. See ADR-0005.
-- ============================================================

CREATE TABLE lesson_subscription (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id                uuid NOT NULL REFERENCES person(id),
  billed_to_id            uuid NOT NULL REFERENCES person(id),
  quarter_id              uuid NOT NULL REFERENCES quarter(id),
  lesson_day              day_of_week NOT NULL,
  lesson_time             time NOT NULL,
  instructor_id           uuid NOT NULL REFERENCES person(id),
  default_horse_id        uuid REFERENCES horse(id),
  subscription_price      numeric(10,2) NOT NULL,   -- snapshotted at enrollment
  is_prorated             boolean NOT NULL DEFAULT false,
  prorated_lesson_count   integer,
  prorated_price          numeric(10,2),
  subscription_type       lesson_subscription_type NOT NULL DEFAULT 'standard',
  status                  lesson_subscription_status NOT NULL DEFAULT 'pending',
  renewal_intent          renewal_intent NOT NULL DEFAULT 'renewing',
  invoice_id              uuid,                     -- FK to invoice added after that table is created
  enrolled_at             timestamptz NOT NULL DEFAULT now(),
  cancelled_at            timestamptz,
  cancellation_deadline   date,
  billing_date            date,
  makeup_notes            text,
  created_by              uuid REFERENCES person(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

CREATE INDEX lesson_subscription_rider_idx ON lesson_subscription(rider_id) WHERE deleted_at IS NULL;
CREATE INDEX lesson_subscription_quarter_idx ON lesson_subscription(quarter_id) WHERE deleted_at IS NULL;
CREATE INDEX lesson_subscription_instructor_idx ON lesson_subscription(instructor_id) WHERE deleted_at IS NULL;


-- ============================================================
-- LESSON PACKAGE
-- One-off lesson products: evaluations, extras, birthday parties, events.
-- NOT for regular quarterly riders (use LessonSubscription).
-- lessons_used is computed at query time — not stored.
-- ============================================================

CREATE TABLE lesson_package (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid NOT NULL REFERENCES person(id),     -- the rider (may be minor)
  billed_to_id      uuid NOT NULL REFERENCES person(id),
  product_type      text NOT NULL,               -- Evaluation, Extra Lesson, Birthday Party, Event, Other
  package_size      integer NOT NULL DEFAULT 1,
  package_price     numeric(10,2) NOT NULL,      -- snapshotted at purchase
  purchased_at      date NOT NULL,               -- business date (may be backdated)
  expires_at        date,
  default_horse_id  uuid REFERENCES horse(id),
  notes             text,
  invoice_id        uuid,                        -- FK to invoice added after that table is created
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES person(id),
  deleted_at        timestamptz
);

CREATE INDEX lesson_package_person_idx ON lesson_package(person_id) WHERE deleted_at IS NULL;


-- ============================================================
-- CAMP SESSION
-- A week-long camp program.
-- ============================================================

CREATE TABLE camp_session (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  week_start          date NOT NULL,             -- Monday of the camp week
  capacity            integer NOT NULL,
  price_per_enrollee  numeric(10,2) NOT NULL,
  status              camp_session_status NOT NULL DEFAULT 'open',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES person(id),
  deleted_at          timestamptz
);


-- ============================================================
-- CAMP ENROLLMENT
-- One record per participant per CampSession.
-- Purchaser is the Person; participant is a name string.
-- ============================================================

CREATE TABLE camp_enrollment (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_session_id           uuid NOT NULL REFERENCES camp_session(id),
  purchased_by_person_id    uuid NOT NULL REFERENCES person(id),
  participant_name          text NOT NULL,
  participant_age           integer,
  status                    camp_enrollment_status NOT NULL DEFAULT 'enrolled',
  invoice_id                uuid,               -- FK to invoice added after that table is created
  compliance_docs_complete  boolean NOT NULL DEFAULT false,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES person(id),
  deleted_at                timestamptz
);

CREATE INDEX camp_enrollment_session_idx ON camp_enrollment(camp_session_id) WHERE deleted_at IS NULL;


-- ============================================================
-- LESSON
-- A single lesson instance. One record per timeslot, regardless of
-- how many riders are in it. lesson_type recalculates from active
-- LessonRider count. duration_minutes is a generated column.
-- See ADR-0008 and ADR-0009.
-- ============================================================

CREATE TABLE lesson (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id         uuid NOT NULL REFERENCES person(id),
  lesson_type           lesson_type NOT NULL,
  -- duration_minutes generated from lesson_type: private=30, semi_private=45, group=60
  duration_minutes      integer GENERATED ALWAYS AS (
    CASE lesson_type
      WHEN 'private'      THEN 30
      WHEN 'semi_private' THEN 45
      WHEN 'group'        THEN 60
    END
  ) STORED,
  scheduled_at          timestamptz NOT NULL,
  status                lesson_status NOT NULL DEFAULT 'pending',
  cancellation_reason   text,
  cancelled_at          timestamptz,
  cancelled_by_id       uuid REFERENCES person(id),
  completed_at          timestamptz,
  notes                 text,
  is_makeup             boolean NOT NULL DEFAULT false,
  makeup_for_lesson_id  uuid REFERENCES lesson(id),
  created_by            uuid REFERENCES person(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX lesson_instructor_idx ON lesson(instructor_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX lesson_scheduled_at_idx ON lesson(scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX lesson_status_idx ON lesson(status) WHERE deleted_at IS NULL;

-- Now add deferred horse_event.lesson_id FK
ALTER TABLE horse_event ADD CONSTRAINT horse_event_lesson_fk
  FOREIGN KEY (lesson_id) REFERENCES lesson(id);


-- ============================================================
-- LESSON RIDER
-- Junction table: riders (with horses and packages) on a lesson.
-- One row per rider per lesson.
-- counts_against_allowance is per-rider — group lessons track independently.
-- ============================================================

CREATE TABLE lesson_rider (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id                 uuid NOT NULL REFERENCES lesson(id),
  rider_id                  uuid NOT NULL REFERENCES person(id),
  horse_id                  uuid REFERENCES horse(id),
  subscription_id           uuid REFERENCES lesson_subscription(id),
  package_id                uuid REFERENCES lesson_package(id),
  makeup_token_id           uuid,               -- FK to makeup_token added after that table is created
  counts_against_allowance  boolean NOT NULL DEFAULT false,
  cancelled_at              timestamptz,
  cancelled_by_id           uuid REFERENCES person(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

-- Exactly one of subscription_id or package_id must be set
ALTER TABLE lesson_rider ADD CONSTRAINT lesson_rider_source_required
  CHECK (
    (subscription_id IS NOT NULL AND package_id IS NULL) OR
    (subscription_id IS NULL AND package_id IS NOT NULL)
  );

CREATE INDEX lesson_rider_lesson_idx ON lesson_rider(lesson_id) WHERE deleted_at IS NULL;
CREATE INDEX lesson_rider_rider_idx ON lesson_rider(rider_id) WHERE deleted_at IS NULL;


-- ============================================================
-- MAKEUP TOKEN
-- An unscheduled makeup credit. Fully auditable.
-- ============================================================

CREATE TABLE makeup_token (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id              uuid NOT NULL REFERENCES person(id),
  subscription_id       uuid REFERENCES lesson_subscription(id),
  original_lesson_id    uuid REFERENCES lesson(id),
  reason                makeup_token_reason NOT NULL,
  grant_reason          text,                   -- admin notes for Admin-Grant tokens
  quarter_id            uuid NOT NULL REFERENCES quarter(id),
  official_expires_at   date NOT NULL,           -- snapshotted from Quarter.end_date at creation time
  status                makeup_token_status NOT NULL DEFAULT 'available',
  scheduled_lesson_id   uuid REFERENCES lesson(id),
  notes                 text,
  status_changed_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES person(id)
);

CREATE INDEX makeup_token_rider_idx ON makeup_token(rider_id);
CREATE INDEX makeup_token_quarter_idx ON makeup_token(quarter_id);
CREATE INDEX makeup_token_status_idx ON makeup_token(status) WHERE status = 'available';

-- Now add deferred lesson_rider.makeup_token_id FK
ALTER TABLE lesson_rider ADD CONSTRAINT lesson_rider_makeup_token_fk
  FOREIGN KEY (makeup_token_id) REFERENCES makeup_token(id);


-- ============================================================
-- TRAINING RIDE
-- Single-table: serves as both schedule entry and log entry.
-- status: Scheduled → Logged. Never goes backwards.
-- ============================================================

CREATE TABLE training_ride (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id        uuid NOT NULL REFERENCES person(id),   -- is_training_ride_provider = true
  horse_id        uuid NOT NULL REFERENCES horse(id),
  ride_date       date NOT NULL,
  status          training_ride_status NOT NULL DEFAULT 'scheduled',
  notes           text,
  logged_at       timestamptz,
  logged_by_id    uuid REFERENCES person(id),
  horse_event_id  uuid REFERENCES horse_event(id),
  created_by      uuid REFERENCES person(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX training_ride_rider_idx ON training_ride(rider_id, ride_date) WHERE deleted_at IS NULL;
CREATE INDEX training_ride_horse_idx ON training_ride(horse_id, ride_date) WHERE deleted_at IS NULL;
CREATE INDEX training_ride_date_idx ON training_ride(ride_date) WHERE deleted_at IS NULL;


-- ============================================================
-- INVOICE
-- A billing statement for a person.
-- total is a generated column (sum of line item totals via view or trigger).
-- stripe_invoice_id required to match webhook events.
-- ============================================================

CREATE TABLE invoice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billed_to_id    uuid NOT NULL REFERENCES person(id),
  period_start    date,
  period_end      date,
  status          invoice_status NOT NULL DEFAULT 'draft',
  due_date        date,
  stripe_invoice_id text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES person(id),
  sent_at         timestamptz,
  paid_at         timestamptz,
  deleted_at      timestamptz
);

CREATE INDEX invoice_billed_to_idx ON invoice(billed_to_id) WHERE deleted_at IS NULL;
CREATE INDEX invoice_status_idx ON invoice(status) WHERE deleted_at IS NULL;
CREATE INDEX invoice_stripe_id_idx ON invoice(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- Now add deferred invoice FKs from lesson_subscription, lesson_package, camp_enrollment
ALTER TABLE lesson_subscription ADD CONSTRAINT lesson_subscription_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES invoice(id);

ALTER TABLE lesson_package ADD CONSTRAINT lesson_package_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES invoice(id);

ALTER TABLE camp_enrollment ADD CONSTRAINT camp_enrollment_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES invoice(id);


-- ============================================================
-- INVOICE LINE ITEM
-- Individual charges on an invoice.
-- total is a generated column (quantity × unit_price).
-- Exactly one source FK is populated per line item. See ADR-0010.
-- ============================================================

CREATE TABLE invoice_line_item (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                      uuid NOT NULL REFERENCES invoice(id),
  description                     text NOT NULL,
  quantity                        numeric(10,3) NOT NULL DEFAULT 1,
  unit_price                      numeric(10,2) NOT NULL,
  total                           numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  is_credit                       boolean NOT NULL DEFAULT false,
  is_admin_added                  boolean NOT NULL DEFAULT false,
  horse_id                        uuid REFERENCES horse(id),
  line_item_type                  invoice_line_item_type NOT NULL DEFAULT 'standard',
  adjustment_for_id               uuid REFERENCES invoice_line_item(id),
  -- Source FKs — exactly one must be populated (enforced below).
  -- See ADR-0010: explicit FKs over polymorphic pattern.
  board_service_log_id            uuid REFERENCES board_service_log(id),
  lesson_subscription_id          uuid REFERENCES lesson_subscription(id),
  lesson_package_id               uuid REFERENCES lesson_package(id),
  camp_enrollment_id              uuid REFERENCES camp_enrollment(id),
  board_service_id                uuid REFERENCES board_service(id),       -- for auto-generated Monthly Board line item
  billing_line_item_allocation_id uuid,               -- FK to billing_line_item_allocation added after that table is created
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  deleted_at                      timestamptz
);

-- Now add deferred board_service_log.invoice_line_item_id FK
ALTER TABLE board_service_log ADD CONSTRAINT board_service_log_invoice_line_item_fk
  FOREIGN KEY (invoice_line_item_id) REFERENCES invoice_line_item(id);

CREATE INDEX invoice_line_item_invoice_idx ON invoice_line_item(invoice_id) WHERE deleted_at IS NULL;


-- ============================================================
-- BILLING LINE ITEM
-- Per-horse charge staging record for billing review.
-- Admin reviews, edits, and allocates before invoices are generated.
-- ============================================================

CREATE TABLE billing_line_item (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id                    uuid NOT NULL REFERENCES horse(id),
  billing_period_start        date NOT NULL,
  billing_period_end          date NOT NULL,
  description                 text NOT NULL,
  quantity                    numeric(10,3) NOT NULL DEFAULT 1,
  unit_price                  numeric(10,2) NOT NULL,
  total                       numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  is_credit                   boolean NOT NULL DEFAULT false,
  is_admin_added              boolean NOT NULL DEFAULT false,
  source_board_service_log_id uuid REFERENCES board_service_log(id),
  source_board_service_id     uuid REFERENCES board_service(id),
  status                      billing_line_item_status NOT NULL DEFAULT 'draft',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES person(id),
  deleted_at                  timestamptz
);

CREATE INDEX billing_line_item_horse_idx ON billing_line_item(horse_id) WHERE deleted_at IS NULL;
CREATE INDEX billing_line_item_period_idx ON billing_line_item(billing_period_start, billing_period_end) WHERE deleted_at IS NULL;
CREATE INDEX billing_line_item_status_idx ON billing_line_item(status) WHERE deleted_at IS NULL;


-- ============================================================
-- BILLING LINE ITEM ALLOCATION
-- Per-person allocation of a BillingLineItem.
-- All allocations for a BillingLineItem must sum to item.total.
-- See ADR-0014.
-- ============================================================

CREATE TABLE billing_line_item_allocation (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_line_item_id  uuid NOT NULL REFERENCES billing_line_item(id),
  person_id             uuid NOT NULL REFERENCES person(id),
  amount                numeric(10,2) NOT NULL,   -- may be negative for credits
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES person(id),
  deleted_at            timestamptz
);

-- Now add deferred invoice_line_item.billing_line_item_allocation_id FK
ALTER TABLE invoice_line_item ADD CONSTRAINT invoice_line_item_billing_allocation_fk
  FOREIGN KEY (billing_line_item_allocation_id) REFERENCES billing_line_item_allocation(id);

CREATE INDEX billing_allocation_item_idx ON billing_line_item_allocation(billing_line_item_id) WHERE deleted_at IS NULL;
CREATE INDEX billing_allocation_person_idx ON billing_line_item_allocation(person_id) WHERE deleted_at IS NULL;


-- ============================================================
-- CUSTOM FIELD DEFINITION
-- Admin-defined fields on Horse and Person.
-- Values stored in entity.custom_fields JSONB column.
-- ============================================================

CREATE TABLE custom_field_definition (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     custom_field_entity_type NOT NULL,
  field_name      text NOT NULL,
  field_type      custom_field_field_type NOT NULL,
  visibility_tier custom_field_visibility_tier NOT NULL DEFAULT 'internal_only',
  section         custom_field_section,          -- null = overflow area at bottom
  created_by      uuid REFERENCES person(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX custom_field_name_unique
  ON custom_field_definition(entity_type, lower(field_name))
  WHERE is_active = true;


-- ============================================================
-- UPDATED_AT TRIGGER
-- Automatically set updated_at on every update.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'horse', 'person', 'person_role', 'notification_preference',
      'horse_contact', 'horse_recording_ids', 'document', 'coggins',
      'lease', 'diet_record', 'care_plan', 'health_item_type',
      'health_program_item', 'health_record', 'quarter',
      'barn_calendar_day', 'board_service', 'horse_event',
      'board_service_log', 'vet_visit', 'horse_scheduling_note',
      'instructor_availability', 'lesson_subscription', 'lesson_package',
      'camp_session', 'camp_enrollment', 'lesson', 'lesson_rider',
      'training_ride', 'invoice', 'invoice_line_item',
      'billing_line_item', 'billing_line_item_allocation'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t
    );
  END LOOP;
END $$;


-- ============================================================
-- SEED DATA: HEALTH ITEM TYPE CATALOG
-- Pre-populated with Maryland-required equine health items.
-- Admin can add, rename, or deactivate via CHIA UI.
-- ============================================================

INSERT INTO health_item_type (name, is_essential, show_in_herd_dashboard, default_interval_days, sort_order) VALUES
  ('Coggins',                       true,  true,  365, 1),  -- tracked separately via Coggins entity; catalog entry for import matching
  ('Rabies Vaccine',                true,  true,  365, 2),
  ('EEE/WEE Encephalitis Vaccine',  true,  true,  365, 3),
  ('Influenza EIV Vaccine',         true,  true,  180, 4),
  ('Rhinopneumonitis Vaccine',      true,  true,  180, 5),
  ('Potomac Horse Fever Vaccine',   true,  true,  365, 6),
  ('Fecal Test',                    false, true,  NULL, 7), -- interval varies per vet program
  ('Dental',                        false, true,  365, 8),
  ('Wormer',                        false, true,  NULL, 9), -- interval varies
  ('Adequan',                       false, false, 180, 10); -- horse-specific; not in dashboard by default


-- ============================================================
-- SEED DATA: BOARD SERVICE CATALOG
-- Pre-populated with starter catalog. Admin can add more via CHIA.
-- ============================================================

INSERT INTO board_service (name, is_billable, is_recurring_monthly, description) VALUES
  ('Monthly Board', true,  true,  'Monthly flat board fee'),
  ('Wrapping',      true,  false, 'Leg wrapping service'),
  ('Groom',         true,  false, 'Grooming service'),
  ('Bath',          true,  false, 'Bath service'),
  ('Farrier',       false, false, 'Farrier visit — provider bills owner directly'),
  ('Massage',       false, false, 'Equine massage — provider bills owner directly'),
  ('Dental',        false, false, 'Dental service — provider bills owner directly');


-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS on all tables.
-- Policies will be added incrementally as each module is built.
-- For now: service role bypasses RLS; anon/authenticated have no access
-- until policies are explicitly granted.
-- ============================================================

ALTER TABLE horse                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE person                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_role                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preference     ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_contact               ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_recording_ids         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coggins                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_record                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_item_type            ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_program_item         ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_event                ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_record               ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarter                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE barn_calendar_day           ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_service               ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_qr_code            ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_event                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_service_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_visit                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_scheduling_note       ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_availability     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_subscription         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_package              ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_session                ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_enrollment             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_rider                ENABLE ROW LEVEL SECURITY;
ALTER TABLE makeup_token                ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_ride               ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_item           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_line_item           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_line_item_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definition     ENABLE ROW LEVEL SECURITY;
