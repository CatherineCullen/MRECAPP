-- ============================================================
-- Events — first-class calendar entity separate from lessons.
--
-- Motivation: birthday parties, clinics, equine therapy, etc. are structurally
-- different from lessons. They don't share lesson_type (private/semi/group)
-- semantics, cancellation windows, makeup tokens, or subscription linkage.
-- Forcing them through the lesson table muddies all of that and creates
-- visual bugs (a 2-hour birthday party showing as a "30 min private").
--
-- Events occupy the same calendar grid as lessons but are their own rows,
-- their own workflow, their own billing path. Lessons stay exactly as they
-- are today — zero touch to the private/semi/group code that just got
-- battle-tested.
--
-- Scope:
--   1. event_type catalog — extensible (add "Barn Tour" etc. via INSERT,
--      no code change)
--   2. event table — one row per scheduled event on the calendar
--   3. invoice_line_item.event_id — billing integration (ADR-0010 pattern)
--   4. Data cleanup — soft-delete the two broken birthday parties currently
--      sitting in lesson_package (they were created via the old flow where
--      birthday parties were squashed into lesson rows; we can't migrate
--      them to events because the lesson rows carry non-event semantics.
--      Catherine re-creates them via the new flow once it ships.)
-- ============================================================


-- ------------------------------------------------------------
-- event_type — catalog of event kinds. Seed rows are reference data;
-- admins can add more later without code changes.
-- ------------------------------------------------------------
CREATE TABLE event_type (
  code                      text PRIMARY KEY,
  label                     text NOT NULL,
  default_duration_minutes  integer NOT NULL CHECK (default_duration_minutes > 0),
  -- Hex color for calendar card accent. Null → fallback to a neutral.
  calendar_color            text CHECK (calendar_color IS NULL OR calendar_color ~ '^#[0-9a-fA-F]{6}$'),
  -- Short 1–4 char badge shown on calendar cards (e.g. "BDAY", "CLIN").
  -- Keeps cards readable without depending on emojis / icon libs.
  calendar_badge            text,
  is_active                 boolean NOT NULL DEFAULT true,
  sort_order                integer NOT NULL DEFAULT 100,
  created_at                timestamptz NOT NULL DEFAULT now()
);

INSERT INTO event_type (code, label, default_duration_minutes, calendar_color, calendar_badge, is_active, sort_order) VALUES
  ('birthday_party', 'Birthday Party', 120, '#e89c3a', 'BDAY', true,  10),
  ('clinic',         'Clinic',         180, '#7b4fab', 'CLIN', true,  20),
  ('equine_therapy', 'Equine Therapy', 60,  '#3a9b88', 'THER', false, 30),
  ('other',          'Other',          60,  '#8c8e98', 'EVT',  true,  90);


-- ------------------------------------------------------------
-- event — one scheduled event on the calendar. Not a lesson.
-- ------------------------------------------------------------
CREATE TABLE event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_code     text NOT NULL REFERENCES event_type(code),
  -- Scheduled start, naive wall-clock (matches lesson.scheduled_at convention
  -- — see 20260416000007_lesson_scheduled_at_naive.sql).
  scheduled_at        timestamp NOT NULL,
  -- Stored duration, editable per event. Default is seeded from event_type
  -- at creation but the admin can override (a 3-hour birthday vs the usual 2).
  duration_minutes    integer NOT NULL CHECK (duration_minutes > 0),
  -- Optional: some events (external clinician, therapist not in our system)
  -- have no CHIA instructor. Nullable.
  instructor_id       uuid REFERENCES person(id),
  -- The Person who hosts/owns this event. Typically also the billed party
  -- (guardian of the birthday kid, event organizer). Required.
  host_id             uuid NOT NULL REFERENCES person(id),
  -- Free text title ("Sophie's 8th Birthday", "Jumping Clinic with Sarah").
  title               text NOT NULL,
  notes               text,
  -- Status lifecycle is simpler than lessons (no makeup, no rider slots).
  status              text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  -- Billing. Price snapshotted at creation. invoice_id is set when the event
  -- gets rolled into an invoice via the billing flow (same pattern as
  -- lesson_package). Nullable until billed.
  price               numeric(10,2) NOT NULL CHECK (price >= 0),
  invoice_id          uuid REFERENCES invoice(id),
  -- Optional: party size for birthday parties, attendee count for clinics.
  -- Not a rigid attendee list — Catherine said Phase 1 doesn't need that.
  party_size          integer CHECK (party_size IS NULL OR party_size > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES person(id),
  deleted_at          timestamptz
);

CREATE INDEX event_scheduled_at_idx   ON event(scheduled_at)             WHERE deleted_at IS NULL;
CREATE INDEX event_host_idx           ON event(host_id)                  WHERE deleted_at IS NULL;
CREATE INDEX event_instructor_idx     ON event(instructor_id)            WHERE deleted_at IS NULL AND instructor_id IS NOT NULL;
CREATE INDEX event_invoice_idx        ON event(invoice_id)               WHERE invoice_id IS NOT NULL;
CREATE INDEX event_unbilled_host_idx  ON event(host_id)                  WHERE invoice_id IS NULL AND deleted_at IS NULL;


-- ------------------------------------------------------------
-- invoice_line_item.event_id — lets billing reference an event as the
-- source of a line item, same pattern as lesson_package_id,
-- lesson_subscription_id, etc. (ADR-0010 explicit nullable FKs).
-- ------------------------------------------------------------
ALTER TABLE invoice_line_item
  ADD COLUMN event_id uuid REFERENCES event(id);

CREATE INDEX invoice_line_item_event_idx
  ON invoice_line_item(event_id)
  WHERE deleted_at IS NULL AND event_id IS NOT NULL;


-- ------------------------------------------------------------
-- Data cleanup — the two broken Birthday Party packages Catherine created
-- via the old flow while building this feature. They live in lesson_package
-- with lesson rows that show as "30 min private" on the calendar; we can't
-- cleanly migrate them (the lesson row has lesson semantics that don't map
-- to events), so we soft-delete both the packages and the associated lessons
-- and she recreates them as Events post-migration.
--
-- Scope is intentionally narrow: specific UUIDs, and only rows that are
-- Birthday Party packages with no invoice yet. Safe if the migration runs
-- on an environment where those rows don't exist (updates zero rows).
-- ------------------------------------------------------------
UPDATE lesson_package
   SET deleted_at = now()
 WHERE id IN (
    '5dea3a31-c02c-45df-a3c4-a2bd3ee796b7',
    'e4a02355-4c5b-499f-9542-175080628c9c'
   )
   AND product_type = 'Birthday Party'
   AND invoice_id IS NULL
   AND deleted_at IS NULL;

UPDATE lesson
   SET deleted_at = now()
 WHERE id IN (
    'a7469d06-e3d7-45ff-b119-6411e0322f73',
    '9c23c479-0849-47d6-8ff7-03a16331c6c8'
   )
   AND deleted_at IS NULL;

-- Matching lesson_rider rows get soft-deleted for consistency — the lessons
-- they point at are gone, no reason to keep the orphans visible.
UPDATE lesson_rider
   SET deleted_at = now()
 WHERE lesson_id IN (
    'a7469d06-e3d7-45ff-b119-6411e0322f73',
    '9c23c479-0849-47d6-8ff7-03a16331c6c8'
   )
   AND deleted_at IS NULL;
