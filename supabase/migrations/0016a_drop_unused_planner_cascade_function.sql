-- Recovered from the live migration history (applied 17 Sept 2026 as
-- "drop_unused_planner_cascade_function" but never committed). Already
-- applied on both hosted projects; kept so a fresh database matches them.
drop function if exists create_planner_offer_as_owner(bigint, uuid, text);
