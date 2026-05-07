-- Drop the legacy quarterly subscription pricing rows from pricing_config
-- and tighten the section CHECK so the option can't come back. Per-lesson
-- subscription pricing (section='subscription_monthly') replaced this
-- under the monthly model (ADR-0019); the legacy rows have been dead
-- since the new-subscription form rewrite stopped reading them.
--
-- The Catalog UI surface that displayed these rows is removed in the
-- same change as this migration.

DELETE FROM pricing_config WHERE section = 'subscription';

ALTER TABLE pricing_config
  DROP CONSTRAINT IF EXISTS pricing_config_section_check;

ALTER TABLE pricing_config
  ADD CONSTRAINT pricing_config_section_check
    CHECK (section IN ('subscription_monthly', 'lesson_package'));
