-- Global on/off toggles for each notification type.
-- Admin can disable a type entirely for everyone here.
-- Per-user opt-outs live in notification_preference.
create table notification_config (
  notification_type notification_type primary key,
  email_enabled     boolean          not null default true,
  sms_enabled       boolean          not null default true,
  updated_at        timestamptz      not null default now(),
  updated_by        uuid             references person(id)
);

-- Seed with sensible defaults for every known type.
-- invoice: Stripe already sends the email, so email is off by default.
-- health_alert / renewal_notice / lesson_confirmation / lesson_type_change:
--   not yet wired — off by default so they're safe to enable when ready.
insert into notification_config (notification_type, email_enabled, sms_enabled) values
  ('lesson_reminder',     true,  true),
  ('lesson_cancellation', true,  true),
  ('lesson_confirmation', false, false),
  ('lesson_type_change',  false, false),
  ('health_alert',        false, false),
  ('invoice',             false, true),
  ('makeup_token',        true,  true),
  ('renewal_notice',      false, false);
