-- Enum + config-column extensions for in-app messaging.
--
-- Split from the messaging tables migration because ALTER TYPE ... ADD
-- VALUE cannot be used in the same transaction as a statement that
-- references the new value (Postgres restriction). The tables migration
-- below seeds notification_config + notification_template rows that use
-- 'message_received' and 'push' values.

alter type notification_type    add value if not exists 'message_received';
alter type notification_channel add value if not exists 'push';

-- New channel needs its own toggle column on the global config row.
alter table notification_config
  add column if not exists push_enabled boolean not null default true;
