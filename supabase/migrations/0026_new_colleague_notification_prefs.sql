-- Me_Profile.txt: "New Psychologists Added Notification" - in my location /
-- matching my specialisms / matching my caseload needs. Added as three more
-- toggles alongside the existing email_on_* preferences (no SMS/text
-- sending infrastructure exists anywhere in this app yet, so - consistent
-- with every other preference here - these remain unwired placeholders
-- until an email provider is configured, not a functioning notifier).
alter table notification_preferences add column email_on_new_colleague_in_location boolean not null default true;
alter table notification_preferences add column email_on_new_colleague_matching_specialism boolean not null default true;
alter table notification_preferences add column email_on_new_colleague_matching_caseload boolean not null default true;
