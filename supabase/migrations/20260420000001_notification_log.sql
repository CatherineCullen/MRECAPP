-- Tracks every notification sent so we can deduplicate and audit.
-- reference_id is the lesson_id, invoice_id, etc. depending on type.
create table notification_log (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid references person(id),
  notification_type notification_type not null,
  channel           notification_channel not null,
  reference_id      uuid,
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- Used by the dedup check before sending.
create index notification_log_dedup_idx
  on notification_log (person_id, notification_type, channel, reference_id);

create index notification_log_reference_idx
  on notification_log (reference_id);
