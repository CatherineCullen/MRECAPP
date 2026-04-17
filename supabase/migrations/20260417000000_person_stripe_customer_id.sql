-- Phase 1 Stripe foundation: attach a Stripe Customer to each Person.
--
-- Required by Stripe Invoicing — every Invoice must be sent to a Customer
-- object, and we sync lazily (create-on-demand via ensureStripeCustomer) so
-- Persons who never get billed stay uncoupled from Stripe.
--
-- The original data-model doc marked this as Phase 2; in practice the
-- Invoicing API needs it Phase 1. Phase 2 will add stripe_payment_method_id
-- alongside for auto-charge.
--
-- Nullable: absence means "no Stripe Customer created yet." Unique (when
-- present) prevents accidental duplicate sync. No FK — Stripe is external.

ALTER TABLE person
  ADD COLUMN stripe_customer_id TEXT NULL;

-- Partial unique index: multiple NULLs allowed, non-null values unique.
CREATE UNIQUE INDEX person_stripe_customer_id_key
  ON person (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
