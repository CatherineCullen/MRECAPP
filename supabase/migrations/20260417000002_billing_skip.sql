-- ============================================================
-- Billing skip — let admin mark a billable source "done, don't invoice."
--
-- Motivation: some events/products are comped, traded, or paid in cash at the
-- barn. Without a skip mechanism those rows sit in Unbilled Products forever
-- (or get deleted, which loses the record). Skip keeps the row + its audit
-- trail on the calendar / person profile, but takes it out of the "to bill"
-- queue.
--
-- Shape: mirrors soft-delete (timestamptz + reason). A row is considered
-- "needs billing" when invoice_id IS NULL AND billing_skipped_at IS NULL.
-- The Unbilled Products page filters on both conditions.
--
-- Applied to both lesson_package and event. Board services / subscriptions /
-- camp enrollments get the same treatment if/when we need it; deferred for
-- now per the "wait until you hit it in real life" rule.
-- ============================================================

ALTER TABLE lesson_package
  ADD COLUMN billing_skipped_at     timestamptz,
  ADD COLUMN billing_skipped_reason text;

ALTER TABLE event
  ADD COLUMN billing_skipped_at     timestamptz,
  ADD COLUMN billing_skipped_reason text;

-- Partial indexes — billing lookups are "what's still pending to bill,"
-- which is exactly `invoice_id IS NULL AND billing_skipped_at IS NULL`.
CREATE INDEX lesson_package_billing_pending_idx
  ON lesson_package(billed_to_id)
  WHERE invoice_id IS NULL AND billing_skipped_at IS NULL AND deleted_at IS NULL;

CREATE INDEX event_billing_pending_idx
  ON event(host_id)
  WHERE invoice_id IS NULL AND billing_skipped_at IS NULL AND deleted_at IS NULL;
