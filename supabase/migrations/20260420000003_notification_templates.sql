-- Stores editable email/SMS templates per notification type + channel.
-- subject is email-only (null for sms).
-- body uses {{variable}} placeholders substituted at send time.
-- default_subject / default_body allow restore-to-default.
create table notification_template (
  notification_type notification_type    not null,
  channel           notification_channel not null,
  subject           text,
  body              text                 not null,
  default_subject   text,
  default_body      text                 not null,
  updated_at        timestamptz          not null default now(),
  updated_by        uuid                 references person(id),
  primary key (notification_type, channel)
);

-- Seed with defaults for all 8 types × 2 channels.
-- Email bodies are the inner content only — the outer wrapper (container div,
-- MREC signature) is added at render time. SMS bodies are plain text.
insert into notification_template
  (notification_type, channel, subject, body, default_subject, default_body)
values

  -- lesson_reminder
  ('lesson_reminder', 'email',
   'Reminder: Your lesson tomorrow at Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Just a reminder — you have a <strong>{{lesson_type}}</strong> scheduled for
<strong>{{lesson_time}}</strong> at Marlboro Ridge Equestrian Center.</p>
<p style="color:#666;font-size:14px">Need to cancel? Please let us know at least 24 hours in advance.</p>',
   'Reminder: Your lesson tomorrow at Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Just a reminder — you have a <strong>{{lesson_type}}</strong> scheduled for
<strong>{{lesson_time}}</strong> at Marlboro Ridge Equestrian Center.</p>
<p style="color:#666;font-size:14px">Need to cancel? Please let us know at least 24 hours in advance.</p>'),

  ('lesson_reminder', 'sms',
   null,
   'MREC reminder: {{lesson_type}} tomorrow {{lesson_time}}. Questions? Contact the barn.',
   null,
   'MREC reminder: {{lesson_type}} tomorrow {{lesson_time}}. Questions? Contact the barn.'),

  -- lesson_cancellation
  -- {{token_note}} renders as '' or ' A makeup token has been added to your account.'
  ('lesson_cancellation', 'email',
   'Your lesson has been cancelled — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Your lesson on <strong>{{lesson_time}}</strong> has been cancelled.</p>
{{token_note}}',
   'Your lesson has been cancelled — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Your lesson on <strong>{{lesson_time}}</strong> has been cancelled.</p>
{{token_note}}'),

  ('lesson_cancellation', 'sms',
   null,
   'MREC: Your lesson on {{lesson_time}} has been cancelled.{{token_note}}',
   null,
   'MREC: Your lesson on {{lesson_time}} has been cancelled.{{token_note}}'),

  -- invoice
  ('invoice', 'email',
   'New invoice from Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>A new invoice from Marlboro Ridge Equestrian Center is ready.
Check your email for the payment link.</p>',
   'New invoice from Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>A new invoice from Marlboro Ridge Equestrian Center is ready.
Check your email for the payment link.</p>'),

  ('invoice', 'sms',
   null,
   'MREC: A new invoice is ready. Check your email for the payment link.',
   null,
   'MREC: A new invoice is ready. Check your email for the payment link.'),

  -- makeup_token
  ('makeup_token', 'email',
   'Makeup token issued — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>A makeup token has been added to your account. Contact the barn to schedule your makeup lesson.</p>',
   'Makeup token issued — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>A makeup token has been added to your account. Contact the barn to schedule your makeup lesson.</p>'),

  ('makeup_token', 'sms',
   null,
   'MREC: A makeup token has been added to your account. Contact the barn to schedule your makeup lesson.',
   null,
   'MREC: A makeup token has been added to your account. Contact the barn to schedule your makeup lesson.'),

  -- lesson_confirmation (not yet wired)
  ('lesson_confirmation', 'email',
   'Lesson confirmed — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Your <strong>{{lesson_type}}</strong> has been scheduled for
<strong>{{lesson_time}}</strong> at Marlboro Ridge Equestrian Center.</p>',
   'Lesson confirmed — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Your <strong>{{lesson_type}}</strong> has been scheduled for
<strong>{{lesson_time}}</strong> at Marlboro Ridge Equestrian Center.</p>'),

  ('lesson_confirmation', 'sms',
   null,
   'MREC: Your {{lesson_type}} is confirmed for {{lesson_time}}. See you then!',
   null,
   'MREC: Your {{lesson_type}} is confirmed for {{lesson_time}}. See you then!'),

  -- lesson_type_change (not yet wired)
  ('lesson_type_change', 'email',
   'Lesson update — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Your lesson on <strong>{{lesson_time}}</strong> has been updated to a
<strong>{{lesson_type}}</strong>.</p>',
   'Lesson update — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>Your lesson on <strong>{{lesson_time}}</strong> has been updated to a
<strong>{{lesson_type}}</strong>.</p>'),

  ('lesson_type_change', 'sms',
   null,
   'MREC: Your lesson on {{lesson_time}} has been updated to a {{lesson_type}}.',
   null,
   'MREC: Your lesson on {{lesson_time}} has been updated to a {{lesson_type}}.'),

  -- health_alert (not yet wired)
  ('health_alert', 'email',
   'Health alert — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p><strong>{{horse_name}}</strong> has a <strong>{{health_item}}</strong> due on
<strong>{{due_date}}</strong>. Please schedule this with your vet.</p>',
   'Health alert — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p><strong>{{horse_name}}</strong> has a <strong>{{health_item}}</strong> due on
<strong>{{due_date}}</strong>. Please schedule this with your vet.</p>'),

  ('health_alert', 'sms',
   null,
   'MREC: {{horse_name}} has a {{health_item}} due on {{due_date}}. Please schedule with your vet.',
   null,
   'MREC: {{horse_name}} has a {{health_item}} due on {{due_date}}. Please schedule with your vet.'),

  -- renewal_notice (not yet wired)
  ('renewal_notice', 'email',
   'Next quarter at Marlboro Ridge Equestrian Center — action needed',
   '<p>Hi {{first_name}},</p>
<p>The next quarter at Marlboro Ridge Equestrian Center is coming up. Your current lesson
subscription will continue unless you let us know otherwise.</p>
<p>Please contact the barn office if you have any changes for next quarter.</p>',
   'Next quarter at Marlboro Ridge Equestrian Center — action needed',
   '<p>Hi {{first_name}},</p>
<p>The next quarter at Marlboro Ridge Equestrian Center is coming up. Your current lesson
subscription will continue unless you let us know otherwise.</p>
<p>Please contact the barn office if you have any changes for next quarter.</p>'),

  ('renewal_notice', 'sms',
   null,
   'MREC: Next quarter is coming up. Contact the barn if you have any changes to your lesson schedule.',
   null,
   'MREC: Next quarter is coming up. Contact the barn if you have any changes to your lesson schedule.');
