-- Nick, 11 Oct:
-- 1. A clinician's clients can be in more than one state. Each client on a
--    cover plan can carry its own state; when it's blank the plan's state
--    applies, so every existing plan works as before.
-- 2. "Ask for cover" from a colleague's profile asks that colleague first:
--    the plan remembers who, and the Candidates step pins them.
-- 3. The sandbox was too busy. Its timed arrivals now start after three
--    minutes, come five to ten minutes apart, and never land within three
--    minutes of another notification.

alter table public.coverage_plan_cases add column if not exists jurisdiction_state text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coverage_plan_cases_state_format') then
    alter table public.coverage_plan_cases
      add constraint coverage_plan_cases_state_format check (jurisdiction_state is null or jurisdiction_state ~ '^[A-Z]{2}$');
  end if;
end $$;

alter table public.coverage_plans add column if not exists preferred_profile_id uuid references public.profiles(id) on delete set null;

-- Cover requests check the colleague's license in the client's own state.
create or replace function public.guard_cover_outreach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  owner uuid;
  st text;
  tele boolean;
begin
  if tg_op = 'INSERT' then
    select pl.profile_id, coalesce(c.jurisdiction_state, pl.jurisdiction_state), coalesce(c.modality, 'either') in ('virtual', 'either')
      into owner, st, tele
    from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
    where c.id = new.coverage_plan_case_id;
    if not private.is_network_member(owner) then
      raise exception 'Your account needs to be verified, with a reviewed license, before you can ask colleagues for cover.' using errcode = 'P0001';
    end if;
    if not private.is_network_member(new.requested_profile_id)
       or private.profile_is_demo(new.requested_profile_id) <> private.profile_is_demo(owner) and not (
         private.profile_is_demo(new.requested_profile_id) and coalesce((select demo_view from profiles where id = owner), false)
       ) then
      raise exception 'That colleague can''t be asked for cover.' using errcode = 'P0001';
    end if;
    if public.is_blocked_between(owner, new.requested_profile_id) then
      raise exception 'That colleague can''t be asked for cover.' using errcode = 'P0001';
    end if;
    if not private.licensed_for(new.requested_profile_id, st, tele) then
      raise exception 'That colleague has no reviewed license for %.', coalesce(st, 'this state') using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and auth.uid() is not null and auth.uid() = new.requested_profile_id
        and new.status is distinct from old.status and new.status in ('accepted', 'discussing') then
    if not private.is_network_member(new.requested_profile_id) then
      raise exception 'Your account needs to be verified, with a reviewed license, before you can take on cover.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

-- A calmer sandbox.
create or replace function public.sandbox_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  st record;
  result jsonb;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    return null;
  end if;
  select * into st from private.sandbox_story where profile_id = me for update skip locked;
  if st.profile_id is null or st.step >= 5 or now() < st.next_at then
    return null;
  end if;
  -- Never on top of something that has just arrived.
  if exists (select 1 from notification_deliveries where recipient_profile_id = me and delivered_at > now() - interval '3 minutes') then
    return null;
  end if;
  result := private.sandbox_story_event(me, st.step + 1);
  update private.sandbox_story
     set step = st.step + 1,
         next_at = now() + (array[interval '5 minutes', interval '7 minutes', interval '9 minutes', interval '10 minutes', interval '0 seconds'])[st.step + 1]
   where profile_id = me;
  return result;
end;
$function$;

-- The first arrival waits three minutes rather than seventy-five seconds.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.seed_demo_viewer_story'::regproc);
  if strpos(d, 'interval ''75 seconds''') > 0 then
    execute replace(d, 'interval ''75 seconds''', 'interval ''180 seconds''');
  end if;
end $$;
