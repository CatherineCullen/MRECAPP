-- In-app messaging — tables, indexes, seeds.
--
-- Spec: docs/requirements/messaging.md
-- Phase 1 of the build: schema only. Server actions, UI, SMS, push all
-- arrive in subsequent phases.

-- ============================================================
-- THREAD
-- A continuous, persistent conversation. Phase 1: always 1:1 between
-- the original participant pair (rider↔instructor or admin↔person).
-- The pair_a_id / pair_b_id columns lock the original two participants
-- on creation: enforces uniqueness (one thread per pair) and gives the
-- inbox label rule a stable "first two" reference even after admin
-- joins as a third participant later. They are sorted (a<b) so the
-- unique index works in both insertion orders.
-- ============================================================

create table thread (
  id          uuid primary key default gen_random_uuid(),
  pair_a_id   uuid not null references person(id),
  pair_b_id   uuid not null references person(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (pair_a_id < pair_b_id)
);

create unique index thread_pair_unique on thread(pair_a_id, pair_b_id);
create index thread_updated_at_idx    on thread(updated_at desc);


-- ============================================================
-- THREAD PARTICIPANT
-- One row per person per thread. Designed to support group threads in
-- the future (currently can hold 2 or 3 rows: original pair + admin
-- once admin posts). last_read_at drives unread-state computation.
-- ============================================================

create table thread_participant (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references thread(id) on delete cascade,
  person_id     uuid not null references person(id),
  joined_at     timestamptz not null default now(),
  last_read_at  timestamptz,
  unique (thread_id, person_id)
);

create index thread_participant_person_idx on thread_participant(person_id);
create index thread_participant_thread_idx on thread_participant(thread_id);


-- ============================================================
-- MESSAGE
-- system_prefix stores auto-injected context (e.g. "Wed Apr 30 · 4:00
-- PM · Cancelled by rider") so display can style it differently from
-- the user-typed body. lesson_id tags the message to a specific lesson
-- — annotation only, does not affect routing.
-- ============================================================

create table message (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references thread(id) on delete cascade,
  sender_id      uuid not null references person(id),
  body           text not null,
  lesson_id      uuid references lesson(id),
  system_prefix  text,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index message_thread_created_idx on message(thread_id, created_at desc);
create index message_lesson_idx          on message(lesson_id) where lesson_id is not null;


-- ============================================================
-- THREAD SMS THROTTLE
-- 60-second per-thread debounce for SMS notifications. One row per
-- thread that has ever produced an SMS; updated on each successful
-- SMS send.
-- ============================================================

create table thread_sms_throttle (
  thread_id    uuid primary key references thread(id) on delete cascade,
  last_sms_at  timestamptz not null default now()
);


-- ============================================================
-- PUSH SUBSCRIPTION
-- Web Push (PWA) subscriptions, one per device per person. endpoint
-- is the unique identifier issued by the browser's push service
-- (Google FCM, Apple APNs, Mozilla autopush). p256dh + auth are the
-- per-subscription encryption keys we need to encrypt push payloads.
-- ============================================================

create table push_subscription (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references person(id),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index push_subscription_person_idx on push_subscription(person_id) where revoked_at is null;


-- ============================================================
-- RLS — service-role bypass posture, consistent with rest of schema.
-- Authorization lives in server actions, not DB policies.
-- ============================================================

alter table thread              enable row level security;
alter table thread_participant  enable row level security;
alter table message             enable row level security;
alter table thread_sms_throttle enable row level security;
alter table push_subscription   enable row level security;


-- ============================================================
-- NOTIFICATION CONFIG seed for message_received.
-- Email is off — messaging notifications never go to email per spec
-- (transactional emails are for invoices, lesson confirmations).
-- SMS and push are on so messages buzz reliably out of the box.
-- ============================================================

insert into notification_config
  (notification_type, email_enabled, sms_enabled, push_enabled)
values
  ('message_received', false, true, true)
on conflict (notification_type) do update
  set sms_enabled  = excluded.sms_enabled,
      push_enabled = excluded.push_enabled;


-- ============================================================
-- NOTIFICATION TEMPLATE seed for message_received.
-- Email is omitted intentionally — see notification_config above.
-- SMS body is the only template; push payload is built in code (the
-- payload structure is JSON, not a text template, so it doesn't fit
-- this table cleanly).
--
-- Variables:
--   {{sender_name}} — sender's display label (with guardian-minor
--                     decoration if applicable)
--   {{preview}}     — first 80 characters of the message body, with
--                     trailing ellipsis if truncated
--   {{app_url}}     — link back to the app for the user to log in
-- ============================================================

insert into notification_template
  (notification_type, channel, subject, body, default_subject, default_body)
values
  ('message_received', 'sms',
   null,
   '{{sender_name}}: "{{preview}}"
Log in to reply: {{app_url}}',
   null,
   '{{sender_name}}: "{{preview}}"
Log in to reply: {{app_url}}')
on conflict (notification_type, channel) do nothing;
