-- Additive schema for the monthly-model rewrite (ADR-0019, ADR-0021).
--
-- Adds the new entities without dropping anything. The drops (Quarter
-- entity, FK columns, mr_quarter strings, enum changes) come in a
-- follow-up migration alongside the server-action updates that reference
-- those columns; doing it additively first keeps the app compilable and
-- gives PRs 4-7 a stable schema target to build against.
--
-- Scope:
--   1. New `lesson_month` table — per-month billing instance for a
--      LessonSubscription. Replaces Quarter as the billing unit.
--   2. `lesson.month_id` FK to lesson_month.
--   3. `lesson_subscription.ended_at` — set when admin marks the slot Inactive.
--   4. `invoice.nmi_invoice_id` — NMI's invoice identifier for invoices
--      created via add_invoice. Mirrors the existing stripe_invoice_id
--      column shape (text, nullable, unique-when-set).
--
-- Out of scope (lands in 20260507_drop_quarterly_schema.sql or similar):
--   - Drop `quarter` table
--   - Drop `lesson_subscription.{quarter_id,subscription_price,is_prorated,
--     prorated_lesson_count,prorated_price,cancellation_deadline,
--     billing_date,invoice_id,renewal_intent}`
--   - Drop `makeup_token.quarter_id`
--   - Drop `barn_calendar_day.{quarter_id,is_makeup_day}`
--   - Drop `lesson_subscription.status` enum 'Pending'/'Completed' values;
--     add 'Inactive'/'Cancelled-In-Error'
--   - Drop `mr_quarter` strings wherever they appear
--   - Test data cleanup (lesson, lesson_rider, makeup_token, etc.)

-- ============================================================================
-- 1. lesson_month — per-month billing instance
-- ============================================================================

CREATE TABLE lesson_month (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     uuid           NOT NULL REFERENCES lesson_subscription(id),
  year                int            NOT NULL,
  month               int            NOT NULL CHECK (month BETWEEN 1 AND 12),
  lesson_count        int            NOT NULL,
  per_lesson_price    numeric(10,2)  NOT NULL,
  total               numeric(10,2)  GENERATED ALWAYS AS (lesson_count * per_lesson_price) STORED,
  invoice_id          uuid           REFERENCES invoice(id),
  status              text           NOT NULL CHECK (status IN ('Pending','Invoiced','Paid','Cancelled')),
  is_prorated         boolean        NOT NULL DEFAULT false,
  generated_at        timestamptz    NOT NULL DEFAULT now(),
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- One LessonMonth per subscription per calendar month (excluding soft-deleted).
CREATE UNIQUE INDEX lesson_month_sub_year_month
  ON lesson_month (subscription_id, year, month)
  WHERE deleted_at IS NULL;

-- Status filter for the Monthly Billing tab queue queries.
CREATE INDEX lesson_month_status_idx
  ON lesson_month (status)
  WHERE deleted_at IS NULL;

-- Year+month for batch generation queries ("all April 2026 LessonMonths").
CREATE INDEX lesson_month_year_month_idx
  ON lesson_month (year, month)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE lesson_month IS
  'Per-month billing instance for a LessonSubscription. One row per subscription per calendar month. Replaces Quarter as the billing unit (ADR-0019). status flow: Pending -> Invoiced -> Paid (or Cancelled if rider stops before invoice).';

-- ============================================================================
-- 2. lesson.month_id — link Lesson rows to their billing month
-- ============================================================================

ALTER TABLE lesson
  ADD COLUMN month_id uuid REFERENCES lesson_month(id);

CREATE INDEX lesson_month_id_idx ON lesson(month_id) WHERE month_id IS NOT NULL;

COMMENT ON COLUMN lesson.month_id IS
  'FK to lesson_month — set when this lesson belongs to a monthly billing instance (subscription-driven). NULL for one-off package lessons (LessonPackage), which bypass the monthly billing unit.';

-- ============================================================================
-- 3. lesson_subscription.ended_at — slot lifecycle marker
-- ============================================================================

ALTER TABLE lesson_subscription
  ADD COLUMN ended_at timestamptz;

COMMENT ON COLUMN lesson_subscription.ended_at IS
  'Business timestamp when the slot was retired (admin marks rider as not continuing). NULL = active slot, generation continues forward at each batch send. Set = generation stops; existing pending LessonMonths after this date should be soft-deleted.';

-- ============================================================================
-- 4. invoice.nmi_invoice_id — mirror of NMI's invoice identifier
-- ============================================================================

ALTER TABLE invoice
  ADD COLUMN nmi_invoice_id text;

CREATE UNIQUE INDEX invoice_nmi_invoice_id_key
  ON invoice (nmi_invoice_id)
  WHERE nmi_invoice_id IS NOT NULL;

COMMENT ON COLUMN invoice.nmi_invoice_id IS
  'NMI Electronic Invoicing identifier returned from add_invoice. Mirrors the stripe_invoice_id column. Used for cross-reference and audit; webhook correlation goes via orderid (= chia invoice id) instead.';
