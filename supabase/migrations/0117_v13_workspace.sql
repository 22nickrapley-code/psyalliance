-- Version 13 workspace (The Hub, Cover, Referrals, Consult, Network / Search,
-- Messages, Library). Additive and safe to run twice. Runs on both projects.
-- Nothing here changes or removes an existing record, ID or permission.
--
--   1. Availability: one overall number of spaces, per-state settings, the
--      90-day rule (confirmed through day 90, stale from day 91).
--   2. Relationships: the four tiers as the workspace reads them.
--   3. People and "me" read models.
--
-- Later sections (Cover, Referrals, Messages, Consult, Invitations, Library,
-- the boot snapshot) are appended below as they are added.

-- 1. Availability ---------------------------------------------------------------
create table if not exists public.profile_state_settings (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null check (state ~ '^[A-Z]{2}$'),
  virtual boolean not null default false,
  in_person boolean not null default false,
  city text,
  updated_at timestamptz not null default now(),
  primary key (profile_id, state),
  constraint profile_state_settings_city_check check (not in_person or length(trim(coalesce(city, ''))) > 0)
);
alter table public.profile_state_settings enable row level security;
revoke all on public.profile_state_settings from anon, authenticated;
grant select on public.profile_state_settings to authenticated;
drop policy if exists "members read their own state settings" on public.profile_state_settings;
create policy "members read their own state settings" on public.profile_state_settings
  for select to authenticated using (profile_id = (select auth.uid()));

-- One rule for "is this confirmation current": through day 90, stale from day 91.
create or replace function public.availability_is_fresh(p_confirmed timestamptz)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select p_confirmed is not null and now() - p_confirmed < interval '91 days';
$function$;
grant execute on function public.availability_is_fresh(timestamptz) to anon, authenticated;

-- A member's reviewed, current licences with the settings for each state.
-- A state they have not set yet follows their profile: virtual unless the
-- profile lists only Face to Face; in person only in their primary state
-- when the profile lists Face to Face and a practice city. They confirm or
-- change these on the new Availability screen.
create or replace view private.member_state_settings as
with lic as (
  select distinct l.profile_id, upper(trim(l.state)) as state
    from public.licenses l
   where l.status = 'active' and l.reviewed_at is not null
     and (l.expiration_date is null or l.expiration_date >= current_date)
), sess as (
  select v.profile_id,
         coalesce(bool_or(lv.value = 'Virtual'), false) as virtual,
         coalesce(bool_or(lv.value = 'Face to Face'), false) as face
    from public.profile_lookup_values v
    join public.lookup_values lv on lv.id = v.lookup_value_id and lv.category = 'session_type'
   group by v.profile_id
)
select lic.profile_id,
       lic.state,
       coalesce(s.virtual, coalesce(x.virtual, false) or not coalesce(x.face, false)) as virtual,
       coalesce(s.in_person, coalesce(x.face, false) and lic.state = upper(trim(p.primary_state)) and nullif(trim(p.primary_practice_city), '') is not null, false) as in_person,
       coalesce(s.city, case when coalesce(x.face, false) and lic.state = upper(trim(p.primary_state)) then nullif(trim(p.primary_practice_city), '') end) as city
  from lic
  join public.profiles p on p.id = lic.profile_id
  left join sess x on x.profile_id = lic.profile_id
  left join public.profile_state_settings s on s.profile_id = lic.profile_id and s.state = lic.state;
revoke all on private.member_state_settings from public, anon, authenticated;

-- Search and "available now" use the same rule everywhere.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.network_directory(jsonb)'::regprocedure);
  if strpos(d, 'pr.availability_confirmed_at >= now() - interval ''30 days''') > 0 then
    execute replace(d, 'pr.availability_confirmed_at >= now() - interval ''30 days''', 'public.availability_is_fresh(pr.availability_confirmed_at)');
  end if;
end $$;

-- The member's own availability as the workspace shows it.
create or replace function public.my_availability()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'open', p.referral_availability in ('yes', 'limited') and (p.availability_paused_until is null or p.availability_paused_until < current_date),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'pausedUntil', p.availability_paused_until,
    'states', coalesce((
      select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
        from private.member_state_settings s where s.profile_id = p.id
    ), '{}'::jsonb))
  from public.profiles p where p.id = auth.uid();
$function$;
revoke all on function public.my_availability() from public, anon;
grant execute on function public.my_availability() to authenticated;

-- Save and confirm: one overall number, settings per licensed state.
-- p_states is {"NY": {"virtual": true, "inPerson": false, "city": ""}, ...}
create or replace function public.set_my_availability(p_open boolean, p_spaces integer, p_states jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  k text;
  v jsonb;
  any_setting boolean := false;
  cur text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can set availability.' using errcode = 'P0001';
  end if;
  if p_spaces is null or p_spaces < 0 or p_spaces > 100 then
    raise exception 'Spaces must be a number from 0 to 100.' using errcode = 'P0001';
  end if;
  p_states := coalesce(p_states, '{}'::jsonb);
  if jsonb_typeof(p_states) <> 'object' then
    raise exception 'Choose settings for your licensed states.' using errcode = 'P0001';
  end if;
  for k, v in select * from jsonb_each(p_states) loop
    if not exists (select 1 from private.member_state_settings s where s.profile_id = me and s.state = upper(k)) then
      raise exception 'You have no reviewed license in %.', k using errcode = 'P0001';
    end if;
    if coalesce((v ->> 'inPerson')::boolean, false) and length(trim(coalesce(v ->> 'city', ''))) = 0 then
      raise exception 'Add the in-person city for %.', k using errcode = 'P0001';
    end if;
    if coalesce((v ->> 'virtual')::boolean, false) or coalesce((v ->> 'inPerson')::boolean, false) then
      any_setting := true;
    end if;
  end loop;
  if p_open and p_spaces > 0 and not any_setting then
    raise exception 'Choose at least one state and setting for your available spaces.' using errcode = 'P0001';
  end if;
  for k, v in select * from jsonb_each(p_states) loop
    insert into profile_state_settings (profile_id, state, virtual, in_person, city, updated_at)
    values (me, upper(k), coalesce((v ->> 'virtual')::boolean, false), coalesce((v ->> 'inPerson')::boolean, false),
            nullif(trim(coalesce(v ->> 'city', '')), ''), now())
    on conflict (profile_id, state) do update
      set virtual = excluded.virtual, in_person = excluded.in_person, city = excluded.city, updated_at = now();
  end loop;
  select referral_availability into cur from profiles where id = me;
  update profiles
     set approx_spaces = p_spaces,
         referral_availability = case when p_open then (case when cur = 'limited' then 'limited' else 'yes' end) else 'no' end,
         accepting_referrals = p_open and not (availability_paused_until is not null and availability_paused_until >= current_date),
         availability_confirmed_at = now()
   where id = me;
  return public.my_availability();
end;
$function$;
revoke all on function public.set_my_availability(boolean, integer, jsonb) from public, anon;
grant execute on function public.set_my_availability(boolean, integer, jsonb) to authenticated;

-- "Confirm unchanged": only the confirmation time moves.
create or replace function public.confirm_my_availability()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can confirm availability.' using errcode = 'P0001';
  end if;
  update profiles set availability_confirmed_at = now() where id = me;
  return public.my_availability();
end;
$function$;
revoke all on function public.confirm_my_availability() from public, anon;
grant execute on function public.confirm_my_availability() to authenticated;

-- 2. Relationships ---------------------------------------------------------------
-- Worked with before, as the workspace reads it: agreed cover, a confirmed
-- referral placement, or a completed arrangement recorded in the history.
-- Messages, reactions and consult replies alone never create it.
create or replace function private.workspace_worked(p_viewer uuid)
returns table (colleague_id uuid, reason text, at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cover as (
    select case when pl.profile_id = p_viewer then r.requested_profile_id else pl.profile_id end as colleague_id,
           'cover'::text as kind, coalesce(r.responded_at, r.sent_at) as at, pl.title, pl.starts_on, pl.ends_on, (pl.profile_id = p_viewer) as mine
      from coverage_requests r
      join coverage_plan_cases c on c.id = r.coverage_plan_case_id
      join coverage_plans pl on pl.id = c.coverage_plan_id
     where r.status = 'accepted' and (pl.profile_id = p_viewer or r.requested_profile_id = p_viewer)
  ), placed as (
    select case when rq.requesting_profile_id = p_viewer then rr.responding_profile_id else rq.requesting_profile_id end as colleague_id,
           'referral'::text as kind, coalesce(rr.responded_at, rr.created_at) as at, null::text as title, null::date as starts_on, null::date as ends_on,
           (rq.requesting_profile_id = p_viewer) as mine
      from referral_responses rr
      join referral_requests rq on rq.id = rr.referral_request_id
     where rr.status = 'accepted' and (rq.requesting_profile_id = p_viewer or rr.responding_profile_id = p_viewer)
  ), events as (
    select case when e.actor_profile_id = p_viewer then e.related_profile_id else e.actor_profile_id end as colleague_id,
           'event'::text as kind, e.created_at as at, e.summary as title, null::date as starts_on, null::date as ends_on, false as mine
      from professional_events e
     where e.event_type in ('coverage_completed', 'referral_outcome', 'collaboration_established', 'reciprocal_coverage_established')
       and (e.actor_profile_id = p_viewer or e.related_profile_id = p_viewer)
       and e.actor_profile_id is not null and e.related_profile_id is not null
  ), all_rows as (
    select * from cover union all select * from placed union all select * from events
  )
  select a.colleague_id,
         (array_agg(a.kind order by a.at desc))[1],
         max(a.at)
    from all_rows a
   where a.colleague_id is not null and a.colleague_id <> p_viewer
   group by a.colleague_id;
$function$;
revoke all on function private.workspace_worked(uuid) from public, anon, authenticated;

-- 3. People ----------------------------------------------------------------------
create or replace function private.initials(p_name text)
returns text
language sql
immutable
as $function$
  select upper(coalesce(left(a[1], 1), '') || case when array_length(a, 1) > 1 then left(a[array_length(a, 1)], 1) else '' end)
    from (select regexp_split_to_array(trim(regexp_replace(coalesce(p_name, ''), '^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+', '', 'i')), '\s+') as a) s;
$function$;

create or replace function private.role_label(p_qualification text)
returns text
language sql
immutable
as $function$
  select case when p_qualification in ('MD', 'DO') then 'Psychiatrist' else 'Clinical psychologist' end;
$function$;

-- Everyone the member can see in the network, as the workspace needs them.
-- Same visibility rules as the existing directory: verified, active,
-- reviewed licence, not blocked, same demo partition.
create or replace function public.workspace_people()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vm as (select * from private.visible_members(auth.uid())),
  facts as (
    select v.profile_id,
      array_agg(lv.value order by v.rank nulls last, lv.value) filter (where lv.category = 'treatment_specialism') focus,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'insurance') insurance,
      array_agg(lv.value order by lv.id) filter (where lv.category = 'age_group_specialism') ages,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'language') languages,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'treatment_modality') modalities,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'session_type') sessions
    from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
    where v.profile_id in (select id from vm)
    group by v.profile_id
  ),
  lic as (
    select s.profile_id, jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state) licenses
      from private.member_state_settings s
     where s.profile_id in (select id from vm)
     group by s.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', regexp_replace(p.full_name, '^(dr\.?)\s+', '', 'i'),
    'initials', private.initials(p.full_name),
    'credential', coalesce(p.qualification_level::text, ''),
    'role', private.role_label(p.qualification_level::text),
    'state', coalesce(upper(trim(p.primary_state)), ''),
    'city', coalesce(p.primary_practice_city, ''),
    'licenses', coalesce(lic.licenses, '{}'::jsonb),
    'specialties', to_jsonb(coalesce(f.focus, '{}'::text[])),
    'slots', case when p.referral_availability = 'no' or (p.availability_paused_until is not null and p.availability_paused_until >= current_date) then 0 else coalesce(p.approx_spaces, 0) end,
    'confirmedAt', p.availability_confirmed_at,
    'languages', to_jsonb(coalesce(f.languages, '{}'::text[])),
    'ages', to_jsonb(coalesce(f.ages, '{}'::text[])),
    'insurance', to_jsonb(coalesce(f.insurance, '{}'::text[])),
    'modalities', to_jsonb(coalesce(f.modalities, '{}'::text[])),
    'sessionTypes', to_jsonb(coalesce(f.sessions, '{}'::text[])),
    'psypact', p.psypact_participating,
    'bio', coalesce(p.bio, ''),
    'avatarPath', p.avatar_path
  ) order by p.full_name), '[]'::jsonb)
  from vm join profiles p on p.id = vm.id
  left join facts f on f.profile_id = p.id
  left join lic on lic.profile_id = p.id
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;

-- The signed-in member as the workspace's own record.
create or replace function public.workspace_me()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', 'me',
    'profileId', p.id,
    'name', regexp_replace(p.full_name, '^(dr\.?)\s+', '', 'i'),
    'initials', private.initials(p.full_name),
    'credential', coalesce(p.qualification_level::text, ''),
    'role', private.role_label(p.qualification_level::text),
    'state', coalesce(upper(trim(p.primary_state)), ''),
    'city', coalesce(p.primary_practice_city, ''),
    'licenses', coalesce((select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
                            from private.member_state_settings s where s.profile_id = p.id), '{}'::jsonb),
    'specialties', coalesce((select jsonb_agg(lv.value order by v.rank nulls last, lv.value)
                               from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
                              where v.profile_id = p.id and lv.category = 'treatment_specialism'), '[]'::jsonb),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'avatarPath', p.avatar_path,
    'isAdmin', p.is_admin
  )
  from profiles p where p.id = auth.uid();
$function$;
revoke all on function public.workspace_me() from public, anon;
grant execute on function public.workspace_me() to authenticated;

-- The four tiers for the signed-in member, as lists of colleague IDs.
create or replace function public.workspace_tiers()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vm as (select id from private.visible_members(auth.uid())),
  trusted as (select t.colleague_id from trusted_colleagues t where t.profile_id = auth.uid() and t.colleague_id in (select id from vm)),
  worked as (select w.colleague_id, w.reason, w.at from private.workspace_worked(auth.uid()) w where w.colleague_id in (select id from vm) and w.colleague_id not in (select colleague_id from trusted)),
  suggested as (select s.colleague_id, s.position from suggested_colleagues s
                 where s.profile_id = auth.uid() and s.colleague_id in (select id from vm)
                   and s.colleague_id not in (select colleague_id from trusted) and s.colleague_id not in (select colleague_id from worked))
  select jsonb_build_object(
    'trust', coalesce((select jsonb_agg(colleague_id order by created_at) from (select t2.colleague_id, t2.created_at from trusted_colleagues t2 where t2.profile_id = auth.uid() and t2.colleague_id in (select id from vm)) q), '[]'::jsonb),
    'worked', coalesce((select jsonb_agg(colleague_id order by at desc) from worked), '[]'::jsonb),
    'suggested', coalesce((select jsonb_agg(colleague_id order by position) from suggested), '[]'::jsonb),
    'workedReasons', coalesce((select jsonb_object_agg(colleague_id, reason) from worked), '{}'::jsonb)
  )
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_tiers() from public, anon;
grant execute on function public.workspace_tiers() to authenticated;

-- Backfill: nothing to copy. Settings are read through private.member_state_settings,
-- which falls back to each member's profile until they save the new screen.

-- 4. Choice lists --------------------------------------------------------------
-- The controlled vocabulary the screens offer, from the product's own lists
-- (so what a member can pick is exactly what colleagues' profiles carry).
create or replace function public.workspace_options()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'focus', (select coalesce(jsonb_agg(value order by value), '[]') from lookup_values where category = 'treatment_specialism'),
    'insurance', (select coalesce(jsonb_agg(value order by case when value in ('Other', 'Self-pay (out of network)') then 1 else 0 end, value), '[]') from lookup_values where category = 'insurance'),
    'language', (select coalesce(jsonb_agg(value order by case when value = 'English' then 0 else 1 end, value), '[]') from lookup_values where category = 'language'),
    'age', (select coalesce(jsonb_agg(value order by case value when 'Children' then 1 when 'Adolescents' then 2 when 'Young Adults' then 3 when 'Adults' then 4 when 'Seniors' then 5 else 9 end), '[]') from lookup_values where category = 'age_group_specialism'),
    'modality', (select coalesce(jsonb_agg(value order by value), '[]') from lookup_values where category = 'treatment_modality')
  );
$function$;
revoke all on function public.workspace_options() from public, anon;
grant execute on function public.workspace_options() to authenticated;

-- 5. Boot ------------------------------------------------------------------------
-- Everything the workspace needs on first load, in one round trip. Each part
-- is its own function so it can be refreshed on its own. (Sections added
-- later extend this function.)
create or replace function public.workspace_boot()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then
    return null;
  end if;
  -- Who the workspace is for: verified clinicians in the network. Everyone
  -- else keeps the existing screens (operators, a referring provider with no
  -- profile, a member whose verification is still in progress).
  if not exists (select 1 from profiles where id = me) then
    return jsonb_build_object('gate', 'no_profile');
  end if;
  if exists (select 1 from profiles where id = me and account_kind = 'operator') then
    return jsonb_build_object('gate', 'operator');
  end if;
  if not private.is_network_member(me) then
    return jsonb_build_object('gate', 'waiting');
  end if;
  result := jsonb_build_object(
    'gate', 'ok',
    'serverNow', now(),
    'me', public.workspace_me(),
    'people', public.workspace_people(),
    'tiers', public.workspace_tiers(),
    'availability', public.my_availability(),
    'options', public.workspace_options()
  );
  return result;
end;
$function$;
revoke all on function public.workspace_boot() from public, anon;
grant execute on function public.workspace_boot() to authenticated;
