-- Real site: remove everything that isn't a genuine member or activity
-- (Nick's instruction in the launch brief: there are no real members yet).
-- Run once on PRODUCTION only. Keeps: the admin (operator) login, lookup
-- lists, the 20 Practice Library resources and their (invalidated) review
-- history, app configuration and scheduled jobs.

-- 1. The 120 fictional members and everything they touched.
select private.purge_demo_network();

-- 2. Test accounts (not genuine members), and everything they own.
delete from auth.users where email in ('22nickrapley+test3@gmail.com');

-- 3. Leftover activity with no genuine owner.
delete from notification_deliveries;
delete from notification_events;
delete from professional_events;
delete from town_hall_messages;
delete from news_cache;
delete from private.demo_rows;
