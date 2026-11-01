-- PsyAlliance 1.1 (Nick's feedback of 1 November). Safe to run more than once.

-- 1. Availability: 60 / 120 days ---------------------------------------------------------------------
-- Confirmed within 60 days ranks normally; 60 to 120 days shows as "not recently confirmed"; over 120
-- days drops out of referral and cover suggestions (was 30 / 90). To be tightened as membership grows.
create or replace function public.availability_is_fresh(p_confirmed timestamptz)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select p_confirmed is not null and now() - p_confirmed < interval '121 days';
$function$;
grant execute on function public.availability_is_fresh(timestamptz) to anon, authenticated;

-- The older helpers that still spell the rule out: same change, applied to their current definitions.
do $$
declare
  f text;
  d text;
begin
  foreach f in array array['private.overflow_candidates', 'public.network_coverage'] loop
    select pg_get_functiondef(to_regproc(f)) into d;
    if d is not null and strpos(d, 'availability_confirmed_at > now() - interval ''90 days''') + strpos(d, 'availability_confirmed_at >= now() - interval ''90 days''') > 0 then
      d := replace(d, 'availability_confirmed_at > now() - interval ''90 days''', 'availability_confirmed_at > now() - interval ''120 days''');
      d := replace(d, 'availability_confirmed_at >= now() - interval ''90 days''', 'availability_confirmed_at >= now() - interval ''120 days''');
      execute d;
    end if;
  end loop;
  -- The "please reconfirm" reminder goes when a confirmation becomes "not recently confirmed": 60 days.
  select pg_get_functiondef(to_regproc('public.queue_availability_checks')) into d;
  if d is not null and strpos(d, 'availability_confirmed_at < now() - interval ''30 days''') > 0 then
    d := replace(d, 'availability_confirmed_at < now() - interval ''30 days''', 'availability_confirmed_at < now() - interval ''60 days''');
    d := replace(d, 't.created_at > now() - interval ''25 days''', 't.created_at > now() - interval ''55 days''');
    execute d;
  end if;
end $$;

-- 2. Availability during setup (Nick, 1 Nov) -----------------------------------------------------------
-- A member whose license is still being reviewed can set their spaces and how they want to be approached.
-- States are added once a license has been reviewed (only reviewed states are ever accepted, as before),
-- and nobody is matched until they are verified.
create or replace function public.set_my_availability(
  p_open boolean, p_spaces integer, p_states jsonb,
  p_paused_until date default null, p_cover text default null, p_consult text default null,
  p_referrals text default null)
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
  has_states boolean;
  cur text;
  v_open boolean;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = me and account_kind = 'clinician') then
    raise exception 'Availability is for clinician accounts.' using errcode = 'P0001';
  end if;
  if p_referrals is not null and p_referrals not in ('yes', 'limited', 'no') then
    raise exception 'Choose accepting, selected referrals only or not accepting.' using errcode = 'P0001';
  end if;
  v_open := case when p_referrals is not null then p_referrals <> 'no' else p_open end;
  if p_spaces is null or p_spaces < 0 or p_spaces > 100 then
    raise exception 'Spaces must be a number from 0 to 100.' using errcode = 'P0001';
  end if;
  if p_paused_until is not null and (p_paused_until < current_date or p_paused_until > current_date + 365) then
    raise exception 'Choose a pause end date between today and a year from now.' using errcode = 'P0001';
  end if;
  if p_cover is not null and p_cover not in ('yes', 'ask', 'no') then
    raise exception 'Choose yes, ask me first or no for cover.' using errcode = 'P0001';
  end if;
  if p_consult is not null and p_consult not in ('yes', 'no') then
    raise exception 'Choose yes or no for consultation.' using errcode = 'P0001';
  end if;
  p_states := coalesce(p_states, '{}'::jsonb);
  if jsonb_typeof(p_states) <> 'object' then
    raise exception 'Choose settings for your licensed states.' using errcode = 'P0001';
  end if;
  has_states := exists (select 1 from private.member_state_settings s where s.profile_id = me);
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
  if has_states and v_open and p_spaces > 0 and not any_setting then
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
         referral_availability = case when p_referrals is not null then p_referrals when p_open then (case when cur = 'limited' then 'limited' else 'yes' end) else 'no' end,
         availability_paused_until = p_paused_until,
         accepting_referrals = v_open and p_paused_until is null,
         coverage_availability = case p_cover when 'yes' then 'yes' when 'ask' then 'ask_me' when 'no' then 'no' else coverage_availability end,
         consultation_availability = case p_consult when 'yes' then 'yes' when 'no' then 'no' else consultation_availability end,
         availability_confirmed_at = now()
   where id = me;
  return public.my_availability();
end;
$function$;
revoke all on function public.set_my_availability(boolean, integer, jsonb, date, text, text, text) from public, anon;
grant execute on function public.set_my_availability(boolean, integer, jsonb, date, text, text, text) to authenticated;

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
  if not exists (select 1 from profiles where id = me and account_kind = 'clinician') then
    raise exception 'Availability is for clinician accounts.' using errcode = 'P0001';
  end if;
  update profiles set availability_confirmed_at = now() where id = me;
  return public.my_availability();
end;
$function$;
