-- Restructure diet_record to match feedroom board layout: AM/PM × Feed/Supplements/Hay
-- Prior columns (feed_instructions, supplements) are dropped — no production data at this stage.

ALTER TABLE diet_record
  DROP COLUMN IF EXISTS feed_instructions,
  DROP COLUMN IF EXISTS supplements,
  ADD COLUMN am_feed         text,
  ADD COLUMN am_supplements  text,
  ADD COLUMN am_hay          text,
  ADD COLUMN pm_feed         text,
  ADD COLUMN pm_supplements  text,
  ADD COLUMN pm_hay          text;
