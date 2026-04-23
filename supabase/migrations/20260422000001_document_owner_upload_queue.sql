-- Owner-uploaded documents go into an admin review queue.
-- Visibility only — the document itself is already in horse docs; this
-- just flags "admin hasn't processed this into structured data yet."
--
-- submitted_by_owner: permanent metadata (true if uploaded via rider portal).
-- reviewed_at / reviewed_by: admin marks processed, row drops out of queue.

ALTER TABLE document
  ADD COLUMN submitted_by_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN reviewed_at        timestamptz,
  ADD COLUMN reviewed_by        uuid REFERENCES person(id);

-- Queue lookup: owner-submitted, not yet reviewed, not soft-deleted.
CREATE INDEX document_owner_upload_queue_idx
  ON document(uploaded_at)
  WHERE submitted_by_owner = true
    AND reviewed_at IS NULL
    AND deleted_at IS NULL;
