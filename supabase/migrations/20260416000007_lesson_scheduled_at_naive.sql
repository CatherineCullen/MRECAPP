-- Convert lesson.scheduled_at from timestamptz to timestamp (naive, wall-clock).
--
-- Rationale: Marlboro Ridge is a single-location barn; "4 PM" means 4 PM at
-- the barn, not "some UTC instant that happens to land at 4 PM in one
-- timezone." Using timestamptz forced clients to do timezone conversions
-- that silently misrepresented times (e.g., a 4 PM lesson displayed as 12 PM
-- for Eastern admin users because the value was stored as UTC 16:00 but
-- re-rendered with local-timezone methods).
--
-- Existing rows were stored as "pretend UTC" — i.e., the wall-clock hour
-- was placed in the UTC slot. The conversion preserves that: extracting
-- the UTC components gives us back the intended wall-clock time.

ALTER TABLE lesson
  ALTER COLUMN scheduled_at
  TYPE timestamp
  USING (scheduled_at AT TIME ZONE 'UTC');

-- Audit timestamps (when things actually happened in real-world UTC) stay
-- as timestamptz — they represent real moments, not wall-clock appointments.
-- Leaving alone: lesson.cancelled_at, completed_at, created_at, updated_at,
-- deleted_at; training_ride.logged_at; and all *_at columns on other tables.
