-- Recover health_program_item rows silently dropped by the vet-record
-- importer's broken upsert (see actions.ts:addVetRecord — the inline
-- supabase.upsert() against a partial unique index returned status 200
-- but inserted nothing). The health_event rows went in fine; only the
-- per-horse schedule rows were missing, which is why imported vet
-- records never appeared on the herd grid.
--
-- This backfill creates a health_program_item for every (horse, type)
-- pair that has at least one health_event but no surviving
-- health_program_item. last_done / next_due come from the most recent
-- event for that pair. Idempotent — safe to re-run.

INSERT INTO health_program_item (horse_id, health_item_type_id, last_done, next_due)
SELECT DISTINCT ON (he.horse_id, he.health_item_type_id)
  he.horse_id,
  he.health_item_type_id,
  he.administered_on,
  he.next_due
FROM health_event he
WHERE he.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM health_program_item hpi
    WHERE hpi.horse_id = he.horse_id
      AND hpi.health_item_type_id = he.health_item_type_id
      AND hpi.deleted_at IS NULL
  )
ORDER BY he.horse_id, he.health_item_type_id, he.administered_on DESC;
