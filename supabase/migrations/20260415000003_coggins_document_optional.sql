-- Make document_id optional on coggins.
-- A Coggins record should be creatable without a PDF upload —
-- the expiry date and vet data are what matter for day-to-day tracking.
-- A document can be attached later when the PDF is available.

ALTER TABLE coggins ALTER COLUMN document_id DROP NOT NULL;
