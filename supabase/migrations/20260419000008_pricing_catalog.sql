-- ============================================================
-- Pricing Catalog
--
-- Adds admin-editable default prices for subscriptions, one-off
-- lesson packages, and event types. Prices are still snapshotted
-- at creation (ADR-0005 pattern) — these defaults just pre-fill
-- the forms so admin isn't typing $900 from memory every time.
-- ============================================================


-- Event types already exist; just add the default_price column.
ALTER TABLE event_type
  ADD COLUMN default_price numeric(10,2) CHECK (default_price IS NULL OR default_price >= 0);


-- pricing_config — one row per configurable price point.
-- Section groups rows for display in the Catalog tab.
CREATE TABLE pricing_config (
  key           text PRIMARY KEY,
  section       text NOT NULL CHECK (section IN ('subscription', 'lesson_package')),
  label         text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 100,
  default_price numeric(10,2) CHECK (default_price IS NULL OR default_price >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pricing_config (key, section, label, sort_order) VALUES
  ('subscription_standard_private',      'subscription',   'Standard — Private (30 min)',       10),
  ('subscription_standard_semi_private', 'subscription',   'Standard — Semi-Private (45 min)',  20),
  ('subscription_standard_group',        'subscription',   'Standard — Group (60 min)',         30),
  ('subscription_boarder_private',       'subscription',   'Boarder — Private (30 min)',        40),
  ('subscription_boarder_semi_private',  'subscription',   'Boarder — Semi-Private (45 min)',   50),
  ('subscription_boarder_group',         'subscription',   'Boarder — Group (60 min)',          60),
  ('lesson_evaluation',                  'lesson_package', 'Evaluation',                        10),
  ('lesson_extra',                       'lesson_package', 'Extra Lesson',                      20);
