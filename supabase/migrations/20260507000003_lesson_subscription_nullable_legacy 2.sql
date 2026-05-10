-- Make legacy quarterly columns nullable on lesson_subscription so the
-- new monthly create flow can insert rows without a quarter reference
-- or a flat per-quarter price (ADR-0019 — neither concept exists in the
-- monthly model).
--
-- The columns themselves (`quarter_id`, `subscription_price`, plus other
-- quarterly leftovers) get dropped entirely in PR 3b-rest's schema
-- cleanup, alongside the rest of the quarterly drop. This migration is
-- the minimum change needed for PR 5b's create form to write a valid
-- row in the meantime.

ALTER TABLE lesson_subscription
  ALTER COLUMN quarter_id          DROP NOT NULL,
  ALTER COLUMN subscription_price  DROP NOT NULL;
