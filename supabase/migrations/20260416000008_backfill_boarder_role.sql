-- Backfill the 'boarder' person_role for anyone who has an active
-- ownership-level horse_contact (Owner / Co-Owner / Lessee) but lacks
-- the role today.
--
-- Going forward this is kept in sync automatically by syncBoarderRole()
-- in the application layer; this migration handles existing data.

INSERT INTO person_role (person_id, role)
SELECT DISTINCT hc.person_id, 'boarder'::person_role_type
FROM horse_contact hc
WHERE hc.deleted_at IS NULL
  AND hc.role IS NOT NULL
  AND lower(regexp_replace(trim(hc.role), '\s+', '-', 'g')) IN (
    'owner', 'co-owner', 'co_owner', 'coowner', 'lessee', 'lessor'
  )
  -- Skip people who already have an active boarder role
  AND NOT EXISTS (
    SELECT 1 FROM person_role pr
    WHERE pr.person_id = hc.person_id
      AND pr.role = 'boarder'
      AND pr.deleted_at IS NULL
  );
