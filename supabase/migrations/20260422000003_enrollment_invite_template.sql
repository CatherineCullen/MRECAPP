-- Move the enrollment invite email body out of hardcoded HTML in
-- src/app/chia/people/[id]/actions.ts and into the editable
-- notification_template table so Catherine can tweak copy without a
-- deploy. Template variables: {{first_name}}, {{enroll_link}},
-- {{expires_days}}.
--
-- We add 'enrollment_invite' to the notification_type enum, seed the
-- template rows (email + sms), and add a notification_config row so the
-- existing toggle UI at /chia/settings/notifications controls whether
-- invites are sent. Invite send bypasses notify() (invited people have no
-- prefs yet) but still respects notification_config.

alter type notification_type add value if not exists 'enrollment_invite';

-- ALTER TYPE ... ADD VALUE can't be used inside the same transaction as
-- the value, so split the seed into its own migration step. Postgres
-- migrations run one statement at a time here, which keeps us safe.
