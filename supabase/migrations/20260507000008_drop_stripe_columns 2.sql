-- Drop the last Stripe-era columns from the schema. CHIA never went live
-- on Stripe (TouchSuite merchant loan forbade it); the entire payments
-- pipeline runs on NMI now (ADR-0021).
--
-- All UI/server reads were detached in the same change as this migration.
-- The boarding draft → send flow uses `nmi_invoice_id` directly.

ALTER TABLE invoice
  DROP COLUMN IF EXISTS stripe_invoice_id,
  DROP COLUMN IF EXISTS hosted_invoice_url;

ALTER TABLE person
  DROP COLUMN IF EXISTS stripe_customer_id;
