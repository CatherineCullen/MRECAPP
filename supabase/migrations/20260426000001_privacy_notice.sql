-- Privacy notice + TCPA consent capture for the enrollment flow.
--
-- The privacy notice rides on the existing document_template versioning
-- (one more value in the kind check). It's a disclosure, not a contract,
-- so there's no signature artifact — instead, every enrollment records
-- which version was shown plus the rider's TCPA SMS consent.
--
-- The waiver/boarding-agreement signing trail already lives in the
-- `document` table; this new `enrollment_acknowledgment` row links the
-- privacy-notice version + TCPA decision to the same enrollment_token,
-- so a single enrollment yields: 1 document row (signed contract) and
-- 1 enrollment_acknowledgment row (notice + consent receipt).

-- 1) Allow 'privacy_notice' as a document_template kind.
alter table document_template
  drop constraint if exists document_template_kind_check;

alter table document_template
  add constraint document_template_kind_check
  check (kind in ('waiver', 'boarding_agreement', 'privacy_notice'));

-- 2) Acknowledgment receipt — one row per completed enrollment.
create table if not exists enrollment_acknowledgment (
  id                            uuid primary key default gen_random_uuid(),
  person_id                     uuid not null references person(id),
  enrollment_token_id           uuid references enrollment_token(id),
  privacy_notice_template_id    uuid not null references document_template(id),
  tcpa_sms_consent              boolean not null,
  acknowledged_at               timestamptz not null default now(),
  ip_address                    inet,
  user_agent                    text
);

create index if not exists idx_enrollment_ack_person
  on enrollment_acknowledgment (person_id);

create index if not exists idx_enrollment_ack_token
  on enrollment_acknowledgment (enrollment_token_id);

-- 3) Seed v1 of the privacy notice. Plain English, MODPA-aligned.
insert into document_template (kind, version, body_markdown)
values (
  'privacy_notice',
  1,
$md$# Privacy Notice — Marlboro Ridge Equestrian Center

**Last updated: April 26, 2026**

Marlboro Ridge Equestrian Center ("we," "the barn") collects and uses information about you and your horse to manage boarding, lessons, training, and veterinary care. This notice explains what we collect, why, and your rights.

## What we collect

- **About you:** name, contact info (email, phone, address), emergency contact, payment information (processed by Stripe — we don't store card numbers), and any notes you provide about lessons or boarding needs.
- **About minors in your care:** name, age, riding experience, and emergency contact. Parents/guardians manage minor accounts.
- **About your horse:** identification, medical and farrier history, vaccinations, vet records, and care instructions.
- **About your activity at the barn:** lessons scheduled and attended, services rendered, training rides logged, sign-ups for visiting providers.
- **Operational records:** account login info, audit logs of changes you make.

## Why we collect it

- To provide the boarding, lesson, and training services you've requested.
- To bill you and process payments.
- To send you operational messages (lesson reminders, scheduling updates, billing notices).
- To keep horses safe — staff need access to medical and care information.
- To comply with law (tax records, etc.).

## Who we share it with

- **Service providers we rely on to run the barn:** Supabase (database hosting), Vercel (web hosting), Stripe (payments), Twilio (text messages), Resend (email), Google Calendar (your optional calendar feed). Each is contractually bound to handle your data only for our purposes.
- **Visiting providers** (vets, farriers, body workers, etc.) when you sign your horse up to see them — they see who's on their list.
- **Law enforcement or regulators** when legally required.

We do **not** sell your information. We do **not** use it for advertising.

## How long we keep it

- Active records: as long as you're a client.
- Financial and tax records: 7 years after your last activity.
- After that, we delete or anonymize.

## Your rights

You can ask us to:

- Show you what we have about you.
- Correct anything that's wrong.
- Delete your records (subject to legal retention requirements above).
- Send you a copy of your data in a portable format.

Email **billing@mrecapp.com** to make a request. We'll respond within 45 days.

## Children

Minors don't have their own accounts. A parent or guardian holds the account and exercises these rights on their behalf.

## Security

Your data is encrypted in transit and at rest. Access is limited to barn staff who need it to do their jobs. Payment information is handled entirely by Stripe and never stored by us.

## Text messages

If you opt in to text messages, we'll send you operational messages only (lesson reminders, schedule changes, billing). Reply STOP to opt out at any time. Message and data rates may apply.

## Changes to this notice

We'll post updates here. If we make a material change to how we use your information, we'll notify you by email.

## Questions

Contact: **billing@mrecapp.com**
$md$
) on conflict (kind, version) do nothing;
