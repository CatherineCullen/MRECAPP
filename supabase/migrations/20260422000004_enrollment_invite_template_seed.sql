-- Seed the enrollment_invite template rows and config toggle.
-- Split from the enum-add migration because Postgres won't let a new
-- enum value be referenced in the same transaction it's declared.

insert into notification_config (notification_type, email_enabled, sms_enabled) values
  ('enrollment_invite', true, false)
on conflict (notification_type) do nothing;

insert into notification_template
  (notification_type, channel, subject, body, default_subject, default_body)
values
  ('enrollment_invite', 'email',
   'Enrollment invitation — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>You''ve been invited to enroll at <strong>Marlboro Ridge Equestrian Center</strong>.
Please click the button below to complete your enrollment and sign your waiver.</p>
<p style="margin:32px 0">
  <a href="{{enroll_link}}" style="background:#0f3460;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
    Complete Enrollment
  </a>
</p>
<p style="color:#666;font-size:14px">This link expires in {{expires_days}} days.</p>',
   'Enrollment invitation — Marlboro Ridge Equestrian Center',
   '<p>Hi {{first_name}},</p>
<p>You''ve been invited to enroll at <strong>Marlboro Ridge Equestrian Center</strong>.
Please click the button below to complete your enrollment and sign your waiver.</p>
<p style="margin:32px 0">
  <a href="{{enroll_link}}" style="background:#0f3460;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
    Complete Enrollment
  </a>
</p>
<p style="color:#666;font-size:14px">This link expires in {{expires_days}} days.</p>'),

  ('enrollment_invite', 'sms',
   null,
   'MREC: You have an enrollment invitation. {{enroll_link}} (expires in {{expires_days}} days)',
   null,
   'MREC: You have an enrollment invitation. {{enroll_link}} (expires in {{expires_days}} days)')
on conflict (notification_type, channel) do nothing;
