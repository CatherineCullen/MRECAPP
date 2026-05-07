-- makeup_token.quarter_id follows lesson_subscription.quarter_id — both go
-- away in PR 3b-rest under the monthly model (ADR-0019, ADR-0020). The
-- token's expiry is `created_at + 10 days` now, not quarter-bound.
--
-- Existing barn-cancel code (in subscriptions/[id]/actions.ts) copies
-- sub.quarter_id into makeup_token rows. The previous migration made the
-- source column nullable; this one makes the destination match so legacy
-- code keeps compiling and running until the column drops entirely.

ALTER TABLE makeup_token
  ALTER COLUMN quarter_id  DROP NOT NULL;
