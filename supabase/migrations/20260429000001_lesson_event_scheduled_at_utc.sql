-- Reverts the naive-timestamp pattern from migration 20260416000007.
--
-- The naive-wall-clock approach saved nothing — it broke as soon as a value
-- got read on the client (Eastern) vs the server (UTC), since the same naked
-- string parses to two different instants. We're going back to the standard
-- pattern: store UTC, convert at display boundaries via date-fns-tz with
-- timezone 'America/New_York'.
--
-- Tables are empty at this point (test data wiped), so the USING clause is
-- defensive only — it would interpret any pre-existing values as
-- America/New_York wall-clock and convert to UTC.

ALTER TABLE lesson
  ALTER COLUMN scheduled_at
  TYPE timestamptz
  USING (scheduled_at AT TIME ZONE 'America/New_York');

ALTER TABLE event
  ALTER COLUMN scheduled_at
  TYPE timestamptz
  USING (scheduled_at AT TIME ZONE 'America/New_York');
