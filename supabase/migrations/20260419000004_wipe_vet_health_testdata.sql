-- Test-data reset: soft-delete every vet_visit, health_event, and
-- health_program_item so Catherine can re-import Hops and Taj against
-- a known-clean slate. Only those two horses had any rows, but a
-- blanket wipe is simpler and leaves no orphan references.
--
-- Soft delete (deleted_at = now()), not DELETE — consistent with the
-- rest of the schema, and reversible if we want the history back.
-- The catalog (health_item_type) is left untouched; prune auto-coined
-- types from the Manage Health Items UI.

UPDATE health_program_item
   SET deleted_at = now()
 WHERE deleted_at IS NULL;

UPDATE health_event
   SET deleted_at = now()
 WHERE deleted_at IS NULL;

UPDATE vet_visit
   SET deleted_at = now()
 WHERE deleted_at IS NULL;
