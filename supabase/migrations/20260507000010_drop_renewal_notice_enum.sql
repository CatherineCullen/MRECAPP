-- Drop 'renewal_notice' from the notification_type enum.
-- Quarterly renewal notifications were never wired up and have no place
-- under the monthly model (ADR-0019). The UI surface that listed them is
-- removed in the same change as this migration.
--
-- Postgres doesn't support ALTER TYPE ... DROP VALUE, so we recreate the
-- enum: convert columns to text → drop enum → recreate without the value
-- → convert columns back. Order matters: rows referencing the doomed
-- value must be deleted first or the cast back to enum will fail.

-- 1. Delete any existing rows that reference the value. None of these
--    are user-facing; nothing notifies on renewal.
DELETE FROM notification_log      WHERE notification_type = 'renewal_notice';
DELETE FROM notification_template WHERE notification_type = 'renewal_notice';
DELETE FROM notification_config   WHERE notification_type = 'renewal_notice';
DELETE FROM notification_preference WHERE notification_type = 'renewal_notice';

-- 2. Detach the enum from each column (cast to text temporarily).
ALTER TABLE notification_log        ALTER COLUMN notification_type TYPE text;
ALTER TABLE notification_template   ALTER COLUMN notification_type TYPE text;
ALTER TABLE notification_config     ALTER COLUMN notification_type TYPE text;
ALTER TABLE notification_preference ALTER COLUMN notification_type TYPE text;

-- 3. Drop and recreate the enum without 'renewal_notice'.
DROP TYPE notification_type;

CREATE TYPE notification_type AS ENUM (
  'lesson_reminder',
  'lesson_cancellation',
  'lesson_confirmation',
  'lesson_type_change',
  'health_alert',
  'invoice',
  'makeup_token',
  'enrollment_invite',
  'message_received'
);

-- 4. Reattach.
ALTER TABLE notification_log
  ALTER COLUMN notification_type TYPE notification_type USING notification_type::notification_type;
ALTER TABLE notification_template
  ALTER COLUMN notification_type TYPE notification_type USING notification_type::notification_type;
ALTER TABLE notification_config
  ALTER COLUMN notification_type TYPE notification_type USING notification_type::notification_type;
ALTER TABLE notification_preference
  ALTER COLUMN notification_type TYPE notification_type USING notification_type::notification_type;
