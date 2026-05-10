-- PR 3b-rest/D — drop the quarter table and every quarter-shaped column
-- from the schema. Replaces the quarterly cadence with the monthly model
-- (ADR-0019, ADR-0020). All read/write code paths were already detached
-- in PRs 3b-rest/A through /C.
--
-- Order: drop FKs/columns first, then the quarter table, then the now-
-- unused renewal_intent enum. Stripe-era columns on lesson_subscription
-- (stripe_subscription_id, stripe_customer_id) are also removed since
-- the boarding/lessons billing pipeline runs entirely on NMI now.

-- 1. lesson_subscription — drop quarterly billing & proration columns,
--    plus dead Stripe linkage and bookkeeping fields tied to the old model.
ALTER TABLE lesson_subscription
  DROP COLUMN IF EXISTS quarter_id,
  DROP COLUMN IF EXISTS renewal_intent,
  DROP COLUMN IF EXISTS subscription_price,
  DROP COLUMN IF EXISTS is_prorated,
  DROP COLUMN IF EXISTS prorated_price,
  DROP COLUMN IF EXISTS prorated_lesson_count,
  DROP COLUMN IF EXISTS billing_date,
  DROP COLUMN IF EXISTS cancellation_deadline;

-- 2. makeup_token — drop quarter_id (token expiry is now created_at + 10
--    days; see ADR-0020).
ALTER TABLE makeup_token
  DROP COLUMN IF EXISTS quarter_id;

-- 3. barn_calendar_day — drop quarter_id. The configuration/calendar UI
--    enumerates rows by date directly; quarters no longer scope the
--    calendar.
ALTER TABLE barn_calendar_day
  DROP COLUMN IF EXISTS quarter_id;

-- 4. Drop the quarter table itself.
DROP TABLE IF EXISTS quarter;

-- 5. Drop the renewal_intent enum, now unused.
DROP TYPE IF EXISTS renewal_intent;
