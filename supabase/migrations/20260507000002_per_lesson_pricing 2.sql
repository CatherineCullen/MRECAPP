-- Per-lesson pricing for the monthly model (ADR-0019).
--
-- The quarterly model priced per-quarter ($X / quarter regardless of
-- lesson count). The monthly model prices per-lesson, applied to the
-- variable lesson count each calendar month gives. Per ADR-0019, all
-- lesson types (Private/Semi-Private/Group) cost the same per-lesson
-- amount — only duration differs — so we collapse the six existing
-- per-type rows into two: one Standard, one Boarder.
--
-- Approach: ADD new pricing_config rows in a new 'subscription_monthly'
-- section without touching the existing 'subscription' rows. The legacy
-- per-quarter rows get cleaned up in PR 3b-rest's schema-and-cruft
-- sweep, alongside the rest of the quarterly drop. Keeping both during
-- the transition keeps the catalog page valid for any quarterly code
-- still running and avoids drift.

-- 1. Expand the section CHECK to allow the new value.
ALTER TABLE pricing_config
  DROP CONSTRAINT IF EXISTS pricing_config_section_check;

ALTER TABLE pricing_config
  ADD CONSTRAINT pricing_config_section_check
    CHECK (section IN ('subscription', 'lesson_package', 'subscription_monthly'));

-- 2. Insert the two new rates. default_price NULL — admin sets per
--    barn policy in the Catalog tab. Per-rider grandfathering is NOT
--    supported (ADR-0019); these are the only two knobs.
INSERT INTO pricing_config (key, section, label, sort_order) VALUES
  ('subscription_monthly_standard', 'subscription_monthly', 'Standard rider — per lesson', 10),
  ('subscription_monthly_boarder',  'subscription_monthly', 'Boarder rider — per lesson',  20);
