-- Recovered from the live migration history (applied 21 Sept 2026 as
-- "town_hall_membership_last_read" and its backfill, never committed).
-- Already applied on both hosted projects; kept so a fresh database can be
-- rebuilt. The seed of fictional Town Hall posts applied the same day
-- ("0041_seed_town_hall_conversations") is data for a retired feature and
-- is not recovered.
alter table town_hall_memberships
  add column if not exists last_read_at timestamptz not null default now();

update town_hall_memberships set last_read_at = joined_at;
