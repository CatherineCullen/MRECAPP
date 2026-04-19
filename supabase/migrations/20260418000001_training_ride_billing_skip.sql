-- Training rides need a skip signal so admin deleting a billing aggregate
-- does not re-surface the same rides on the next queue load. Mirrors the
-- pattern already in place on lesson_package + event (migration
-- 20260417000002_billing_skip.sql): three columns, timestamptz + actor + reason.
--
-- The seed in loadQueue.ts filters `billing_skipped_at IS NULL` so skipped
-- rides stay out of the queue but remain visible on the horse timeline as
-- "unbilled" — the rides happened, they're just not going on an invoice.

ALTER TABLE training_ride
  ADD COLUMN billing_skipped_at     timestamptz,
  ADD COLUMN billing_skipped_by     uuid REFERENCES person(id),
  ADD COLUMN billing_skipped_reason text;

CREATE INDEX training_ride_billing_skipped_idx
  ON training_ride(billing_skipped_at)
  WHERE billing_skipped_at IS NOT NULL;
