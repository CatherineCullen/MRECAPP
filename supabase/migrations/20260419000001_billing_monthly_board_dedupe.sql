-- Monthly Board line items were being double-seeded when the Review &
-- Allocate page loaded twice in quick succession (no DB-level guard;
-- two concurrent requests could both see "no row yet" and both insert).
--
-- This migration:
--  1. Soft-deletes existing duplicate Monthly Board rows, keeping the
--     earliest-created row per (horse, service, calendar month).
--  2. Adds a partial unique index so Postgres refuses the second insert
--     outright if a race happens again. Filters on deleted_at IS NULL
--     so an admin can still hard-reseed by soft-deleting and reinserting
--     (matches the codebase's broader soft-delete convention).
--
-- `created_at` is timestamptz; date_trunc on timestamptz is STABLE, not
-- IMMUTABLE. Casting via `AT TIME ZONE 'UTC'` yields a plain timestamp,
-- which makes date_trunc IMMUTABLE and usable in an index expression.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        horse_id,
        source_board_service_id,
        date_trunc('month', created_at AT TIME ZONE 'UTC')
      ORDER BY created_at ASC
    ) AS rn
  FROM billing_line_item
  WHERE source_board_service_id IS NOT NULL
    AND deleted_at IS NULL
)
UPDATE billing_line_item
SET deleted_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX billing_line_item_monthly_unique
  ON billing_line_item (
    horse_id,
    source_board_service_id,
    date_trunc('month', created_at AT TIME ZONE 'UTC')
  )
  WHERE source_board_service_id IS NOT NULL
    AND deleted_at IS NULL;

COMMIT;
