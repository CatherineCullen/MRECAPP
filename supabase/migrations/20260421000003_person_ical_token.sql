-- Per-person opaque token for the read-only iCal calendar feed at
-- /api/ical/[token]/lessons.ics. Not derivable from the person id; the feed
-- URL is the credential. Admin can rotate via a Profile action if leaked.
--
-- Lazily generated — null until the rider first opens their Calendar panel
-- on the Profile page, which triggers the generator.

ALTER TABLE person ADD COLUMN IF NOT EXISTS ical_token text;
CREATE UNIQUE INDEX IF NOT EXISTS person_ical_token_idx ON person(ical_token) WHERE ical_token IS NOT NULL;
