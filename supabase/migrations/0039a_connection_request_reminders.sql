-- Recovered from the live migration history (applied 21 Sept 2026 as
-- "0040_connection_request_reminders" but never committed). Already
-- applied on both hosted projects; kept so a fresh database can be
-- rebuilt from this folder (staging, restore rehearsals).
alter table connections add column if not exists reminder_sent_at timestamptz;
