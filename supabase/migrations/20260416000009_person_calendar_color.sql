-- Add optional calendar_color to person — admin override for the automatic
-- hashed color on lesson-calendar instructor stripes.
--
-- Nullable: absence means "use the hash-based default" (see
-- app/src/app/chia/lessons-events/_lib/instructorColor.ts). Stored as a 6-char hex
-- string with leading '#' for simplicity; the palette today is fixed but
-- allowing any color keeps this forward-compatible with a custom picker.

ALTER TABLE person
  ADD COLUMN calendar_color TEXT NULL;

-- Shape check: if present, must be a '#RRGGBB' string. Null is fine.
ALTER TABLE person
  ADD CONSTRAINT person_calendar_color_format
  CHECK (calendar_color IS NULL OR calendar_color ~ '^#[0-9a-fA-F]{6}$');
