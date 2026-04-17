-- ============================================================
-- Fix latent trigger failure on three tables that were registered with
-- set_updated_at() but never had the updated_at column.
--
-- The initial migration's DO-block applied `set_updated_at` to a hand-listed
-- set of tables. Three of those tables (board_service_log, person_role,
-- health_event) were created without an updated_at column, so any UPDATE
-- fails with: `record "new" has no field "updated_at"`.
--
-- Until today the bug was latent — Review Queue approvals happen to be the
-- first production UPDATE path on board_service_log, and it started firing
-- when the first admin tried to approve a service log. The other two tables
-- also silently carry the bug; fix them at the same time to prevent it
-- surfacing later.
--
-- Adding the column (vs. dropping the trigger) keeps the invariant stated
-- in the initial migration's header comment: "All tables have created_at,
-- updated_at." Consistency is worth one nullable-with-default column.
-- ============================================================

ALTER TABLE board_service_log
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE person_role
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE health_event
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
