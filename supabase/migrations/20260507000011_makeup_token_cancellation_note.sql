-- Add cancellation_note to makeup_token so the rider's (or admin's)
-- cancellation context surfaces consistently anywhere a token shows
-- up — Tokens list, Token detail, the makeup lesson once scheduled.
--
-- Previously the rider's note went only to a tagged thread message,
-- which the lesson-detail page surfaces but the Tokens UI doesn't
-- look at. Token-side storage gives every downstream surface a
-- single column to read.
--
-- Distinct from `notes` (admin's working note about the token, edited
-- inline in the Tokens list) and `grant_reason` (admin-grant tokens'
-- "why we issued this without a source lesson").

ALTER TABLE makeup_token
  ADD COLUMN IF NOT EXISTS cancellation_note text;

COMMENT ON COLUMN makeup_token.cancellation_note IS 'The cancel note from the rider (or admin, on barn-cancel). Captured when the token is issued; immutable thereafter. Distinct from notes (admin working note) and grant_reason (admin-grant context).';
