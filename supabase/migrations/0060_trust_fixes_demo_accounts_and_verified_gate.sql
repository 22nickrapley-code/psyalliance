-- Product Spec v1, Stage 1 (trust fixes), per the Sept 23 re-audit's P0
-- findings R2/R3, confirmed against the live database before writing:
--   * 60 of the 61 "verified" profiles were seed fixtures (@seed.psyalliance.test)
--     and all of them appeared in the member directory and matching.
--   * none of the 61 verified profiles had a licence on record.
--   * the "about 972 clinicians" audience count counted public_directory
--     rows, which is one row per profile per lookup value, not per person.
--
-- Nothing is deleted. Seed accounts stay in the database, flagged is_demo,
-- and only ever see each other (so a demo environment still works); real
-- members never see them anywhere.

alter table profiles add column if not exists is_demo boolean not null default false;

update profiles p
set is_demo = true
from auth.users u
where u.id = p.id
  and (u.email ilike '%@seed.psyalliance.test' or u.email ilike '%.test');

-- The signed-in viewer's own demo flag. security definer so it can read the
-- caller's own profile row regardless of RLS; returns false for anon.
create or replace function public.viewer_is_demo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_demo from profiles where id = auth.uid()), false);
$$;

revoke all on function public.viewer_is_demo() from public;
grant execute on function public.viewer_is_demo() to authenticated;

-- Spec rule 2, "verified means reviewed": a real member is listed only when
-- an admin has verified them AND they hold an active licence on record.
-- Demo fixtures are exempt from the licence rule (they have none) but are
-- only visible to other demo accounts.
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
  and (
    p.is_demo
    or exists (
      select 1 from licenses l
      where l.profile_id = p.id
        and l.status = 'active'
        and (l.expiration_date is null or l.expiration_date >= current_date)
    )
  );

revoke all on public.public_directory from anon;
grant select on public.public_directory to authenticated;

-- Spec rule 4, "real numbers only": the number of distinct people a
-- network-wide request would reach, excluding the caller.
create or replace function public.eligible_network_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct id)::integer
  from public_directory
  where id <> auth.uid();
$$;

grant execute on function public.eligible_network_count() to authenticated;
