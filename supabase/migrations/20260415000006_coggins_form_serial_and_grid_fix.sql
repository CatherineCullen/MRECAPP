-- 1. Add form_serial_number to coggins table
--    (accession_number was never stored — this replaces it in the schema)
ALTER TABLE coggins ADD COLUMN IF NOT EXISTS form_serial_number text;

-- 2. Backfill health_program_item for any existing coggins records
--    Fixes the herd health grid for horses already imported (e.g. Taj)
--    Uses INSERT WHERE NOT EXISTS because the unique constraint is a partial index
INSERT INTO health_program_item (horse_id, health_item_type_id, last_done, next_due)
SELECT
  c.horse_id,
  hit.id,
  c.date_drawn,
  c.expiry_date
FROM coggins c
JOIN health_item_type hit ON hit.name = 'Coggins' AND hit.deleted_at IS NULL
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM health_program_item hpi
    WHERE hpi.horse_id = c.horse_id
      AND hpi.health_item_type_id = hit.id
      AND hpi.deleted_at IS NULL
  );

-- 3. Update import prompts: rename accession_number → form_serial_number in the JSON template
UPDATE import_prompt
SET
  body = replace(replace(body,
    '"accession_number": null',
    '"form_serial_number": null'),
    '- accession_number: the official Coggins accession/test number if printed on the certificate.',
    '- form_serial_number: the Form Serial Number printed at the top of the Coggins certificate (e.g. "EIA-2024-123456"). This is distinct from the accession number.'
  ),
  default_body = replace(replace(default_body,
    '"accession_number": null',
    '"form_serial_number": null'),
    '- accession_number: the official Coggins accession/test number if printed on the certificate.',
    '- form_serial_number: the Form Serial Number printed at the top of the Coggins certificate (e.g. "EIA-2024-123456"). This is distinct from the accession number.'
  )
WHERE slug = 'coggins';
