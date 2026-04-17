-- ============================================================
-- Billing line items: make billing_period_start/end nullable
--
-- Under the always-on Billing Review model, a billing_line_item is created
-- the moment a service log is approved or an admin adds an ad hoc charge —
-- long before we know what billing "period" it will belong to. The period
-- gets stamped when the admin clicks Generate Invoices: every Reviewed
-- line item currently in the queue gets the generation date as its
-- period_end, and the previous Generate's date (or creation date for the
-- first run) as period_start.
--
-- Having these NOT NULL forced a fake period at creation time and risked
-- bugs where a later Generate picked up items stamped with the wrong period.
-- Nullable is the honest representation: "period = NULL → not yet invoiced."
-- ============================================================

ALTER TABLE billing_line_item
  ALTER COLUMN billing_period_start DROP NOT NULL,
  ALTER COLUMN billing_period_end   DROP NOT NULL;

-- The existing period index becomes less useful (all open items are NULL)
-- but we'll keep it — it still speeds filters for historical queries where
-- admin wants to see "everything billed in May."
