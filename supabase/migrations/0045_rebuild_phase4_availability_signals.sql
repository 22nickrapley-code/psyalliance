-- Rebuild Phase 4, batch 3: the three-way availability signals Coverage's
-- own matching needs (Master Brief #31-32) and doesn't have yet - today
-- profiles only has a single boolean `accepting_referrals`. Added as new
-- columns rather than changing that boolean's type, so nothing that already
-- reads it breaks; the old column simply becomes redundant with
-- referral_availability and can be retired in a later cleanup pass once
-- every read site has moved over.

alter table profiles
  add column if not exists referral_availability text not null default 'yes'
    check (referral_availability in ('yes', 'limited', 'no')),
  add column if not exists coverage_availability text not null default 'ask_me'
    check (coverage_availability in ('yes', 'ask_me', 'no')),
  add column if not exists consultation_availability text not null default 'yes'
    check (consultation_availability in ('yes', 'limited', 'no')),
  -- Freshness (Master Brief #32): "Availability confirmed 6 days ago".
  -- Null until the member has confirmed it at least once.
  add column if not exists availability_confirmed_at timestamptz;

comment on column profiles.coverage_availability is
  'Available for temporary coverage requests: yes / ask_me (ask before assuming) / no. Used by Coverage matching''s operational-fit stage.';
