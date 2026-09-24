-- Product Spec v1, Stage 3 (core loop): data support for the shared
-- matching engine, the Cover wizard and the Refer flow.
--
-- 1. Licence facts readable across the network.
--    licenses has an owner-only RLS policy, so every "licences!inner" join
--    against other members silently returned nobody: Cover and Referral
--    suggestions could never find a colleague, and the directory's licence
--    requirement (0060) would have hidden every other member. These two
--    security definer helpers expose only the fact needed for matching and
--    listing (which states a verified member holds an active, unexpired
--    licence in), never licence numbers or other details.

create or replace function public.has_active_licence(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from licenses l
    where l.profile_id = target
      and l.status = 'active'
      and (l.expiration_date is null or l.expiration_date >= current_date)
  );
$$;

revoke all on function public.has_active_licence(uuid) from public;
grant execute on function public.has_active_licence(uuid) to authenticated;

-- Active licence states for every member the caller is allowed to match
-- with: verified, active account, same demo/real environment as the caller.
create or replace function public.network_licence_states()
returns table (profile_id uuid, states text[])
language sql
stable
security definer
set search_path = public
as $$
  select l.profile_id, array_agg(distinct upper(trim(l.state))) as states
  from licenses l
  join profiles p on p.id = l.profile_id
  where l.status = 'active'
    and (l.expiration_date is null or l.expiration_date >= current_date)
    and p.verification_status = 'verified'
    and p.account_status = 'active'
    and p.is_demo = public.viewer_is_demo()
  group by l.profile_id;
$$;

revoke all on function public.network_licence_states() from public;
grant execute on function public.network_licence_states() to authenticated;

drop view if exists public.public_directory;

create view public.public_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.credential_prefix,
  p.qualification_level,
  p.board_certified,
  p.primary_practice_city,
  p.primary_state,
  p.accepting_referrals,
  p.referral_availability,
  p.coverage_availability,
  p.consultation_availability,
  p.availability_confirmed_at,
  p.last_active_at,
  p.practice_website,
  p.contact_phone,
  p.contact_email,
  p.open_to_group_consultation,
  p.open_to_give_supervision,
  p.open_to_receive_supervision,
  p.psypact_participating,
  p.avatar_path,
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified'
  and p.is_demo = public.viewer_is_demo()
  and (p.is_demo or public.has_active_licence(p.id));

revoke all on public.public_directory from anon;
grant select on public.public_directory to authenticated;

-- 2. Referrals: a need can name several treatment focus areas.
alter table referral_requests
  add column if not exists specialism_lookup_ids bigint[] not null default '{}';

update referral_requests
set specialism_lookup_ids = array[specialism_lookup_id]
where specialism_lookup_id is not null and specialism_lookup_ids = '{}';

-- 3. Cover: the wizard's absence type, jurisdiction and outreach mode.
alter table coverage_plans
  add column if not exists absence_type text
    check (absence_type in ('short_planned', 'extended_leave', 'unexpected', 'closing_practice', 'reciprocal')),
  add column if not exists jurisdiction_state text,
  add column if not exists outreach_mode text not null default 'sequential'
    check (outreach_mode in ('sequential', 'parallel')),
  add column if not exists completed_at timestamptz;

alter table coverage_plan_cases
  add column if not exists prescribing_needed boolean not null default false;

-- 4. Private "would work with again" after a cover or referral ends.
--    Feeds matching; never shown to the colleague or anyone else.
create table if not exists collaboration_ratings (
  id bigint generated always as identity primary key,
  rater_profile_id uuid not null references profiles (id) on delete cascade,
  colleague_profile_id uuid not null references profiles (id) on delete cascade,
  context_type text not null check (context_type in ('cover', 'referral', 'consult')),
  context_id bigint not null,
  would_work_again boolean not null,
  created_at timestamptz not null default now(),
  unique (rater_profile_id, colleague_profile_id, context_type, context_id)
);

create index if not exists idx_collaboration_ratings_rater on collaboration_ratings (rater_profile_id);

alter table collaboration_ratings enable row level security;

create policy "collaboration ratings are private to the rater" on collaboration_ratings
  for all using (rater_profile_id = (select auth.uid()))
  with check (rater_profile_id = (select auth.uid()));
