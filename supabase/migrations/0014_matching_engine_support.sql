-- Support columns for the weighted matching engine: last_active_at (tie-break
-- #4 in the spec's cascade: relationship tier -> speciality rating ->
-- endorsements -> last login -> alphabetical) and an optional city on
-- referral_requests so location scoring can distinguish city/state/national
-- tiers (previously state-only).

alter table profiles add column last_active_at timestamptz not null default now();
alter table referral_requests add column city text;

-- Recreate public_directory to also expose last_active_at - still no PHI,
-- just an activity timestamp used for match tie-breaking and to show
-- "recently active" in the directory.
drop view public_directory;

create view public_directory as
select
  p.id,
  p.full_name,
  p.credential_prefix,
  p.qualification_level,
  p.board_certified,
  p.primary_practice_city,
  p.primary_state,
  p.accepting_referrals,
  p.last_active_at,
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified';

grant select on public_directory to anon, authenticated;
