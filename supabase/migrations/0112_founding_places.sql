-- Founding members (Nick, 11 Oct): the first 50 members in each state are
-- founding members and never pay for membership.
--   * A place is given when a member is approved: their profile is verified
--     and a current license in their main practice state has been reviewed.
--   * Places are numbered in that order, one per person, in their main
--     practice state. A place is kept for good and never reused, even if the
--     member later leaves.
--   * The public site shows places left in a state once 10 are taken.

create table if not exists public.founding_places (
  state text not null check (state ~ '^[A-Z]{2}$'),
  place smallint not null check (place between 1 and 50),
  profile_id uuid unique references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (state, place)
);

alter table public.founding_places enable row level security;
revoke all on public.founding_places from anon, authenticated;
grant select on public.founding_places to authenticated;
drop policy if exists "members see founding places" on public.founding_places;
create policy "members see founding places" on public.founding_places
  for select to authenticated using (true);

-- Gives the member their place if they qualify and a place is left.
-- Never raises: an approval must not fail because of this.
create or replace function private.grant_founding_place(uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare st text; nxt int;
begin
  if uid is null or exists (select 1 from founding_places where profile_id = uid) then
    return;
  end if;
  select upper(trim(p.primary_state)) into st
    from profiles p
   where p.id = uid
     and p.account_kind = 'clinician'
     and p.verification_status = 'verified'
     and p.account_status = 'active'
     and not p.is_demo
     and not coalesce(p.demo_view, false)
     and not private.is_sandbox_guest(p.id)
     and exists (
       select 1 from licenses l
        where l.profile_id = p.id
          and upper(trim(l.state)) = upper(trim(p.primary_state))
          and l.status = 'active'
          and l.reviewed_at is not null
          and (l.expiration_date is null or l.expiration_date >= current_date));
  if st is null or st !~ '^[A-Z]{2}$' then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('founding_places:' || st));
  select coalesce(max(place), 0) + 1 into nxt from founding_places where state = st;
  if nxt > 50 then
    return;
  end if;
  insert into founding_places (state, place, profile_id) values (st, nxt, uid) on conflict do nothing;
  if found then
    insert into system_notifications (profile_id, title, body)
    values (uid, 'You''re a founding member',
            'You''re founding member #' || nxt || ' in your state. You never pay for membership, for as long as you remain a member. It shows on your profile.');
  end if;
exception when others then
  raise warning 'grant_founding_place(%): %', uid, sqlerrm;
end;
$function$;
revoke all on function private.grant_founding_place(uuid) from public, anon, authenticated;

create or replace function private.founding_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_table_name = 'licenses' then
    perform private.grant_founding_place(new.profile_id);
  else
    perform private.grant_founding_place(new.id);
  end if;
  return null;
end;
$function$;

drop trigger if exists founding_place_profile on public.profiles;
create trigger founding_place_profile
  after update of verification_status, account_status, primary_state on public.profiles
  for each row when (new.verification_status = 'verified' and new.account_status = 'active')
  execute function private.founding_on_change();

drop trigger if exists founding_place_licence on public.licenses;
create trigger founding_place_licence
  after insert or update of reviewed_at, status, expiration_date, state on public.licenses
  for each row when (new.reviewed_at is not null)
  execute function private.founding_on_change();

-- Places left, for the public site: only states with at least 10 taken,
-- counts only.
create or replace function public.founding_places_left()
returns table (state text, taken integer, places_left integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select f.state, count(*)::integer, (50 - count(*))::integer
    from founding_places f
   group by f.state
  having count(*) >= 10
   order by f.state;
$function$;
revoke all on function public.founding_places_left() from public;
grant execute on function public.founding_places_left() to anon, authenticated;

-- Members already approved get their places, in the order they qualified.
do $$
declare r record;
begin
  for r in
    select p.id
      from profiles p
     where p.account_kind = 'clinician' and p.verification_status = 'verified' and p.account_status = 'active' and not p.is_demo
     order by greatest(coalesce(p.verified_at, p.created_at),
                       coalesce((select min(l.reviewed_at) from licenses l
                                  where l.profile_id = p.id and upper(trim(l.state)) = upper(trim(p.primary_state))), p.created_at)),
              p.created_at
  loop
    perform private.grant_founding_place(r.id);
  end loop;
end $$;
