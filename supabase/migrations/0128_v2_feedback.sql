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

-- 3. Advise, don't block (Nick, 1 Nov) --------------------------------------------------------------
-- Only three things stop a colleague being asked or chosen: no reviewed license in the client's state, a colleague
-- who has paused or closed that service (or is away), and members who cannot see each other (blocked). Everything
-- else (a second focus, an age group, insurance, setting, language, city, prescribing) is shown as a warning and the
-- member decides. The full list is kept as private.cover_all_exclusions; cover_exclusions now returns only the
-- hard stops, so referrals, cover requests, answers and placements all follow the same rule.
do $$
declare d text;
begin
  if to_regprocedure('private.cover_all_exclusions(uuid,text,text,boolean,text,text,text,text,text,text,text)') is null then
    select pg_get_functiondef('private.cover_exclusions(uuid,text,text,boolean,text,text,text,text,text,text,text)'::regprocedure) into d;
    d := replace(d, 'FUNCTION private.cover_exclusions(', 'FUNCTION private.cover_all_exclusions(');
    execute d;
  end if;
end $$;

create or replace function private.cover_exclusions(p_candidate uuid, p_state text, p_setting text, p_prescribing boolean, p_focus text, p_secondary text, p_age text, p_insurance text, p_language text, p_city text, p_kind text default 'cover')
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(x) filter (where x like 'Not a colleague%' or x like 'No reviewed %' or x like 'Paused %' or x like 'Not open to cover%' or x like 'Not taking %'), '{}')
    from unnest(private.cover_all_exclusions(p_candidate, p_state, p_setting, p_prescribing, p_focus, p_secondary, p_age, p_insurance, p_language, p_city, p_kind)) x;
$function$;

-- 4. Referrals go to the whole audience the member chose (Nick, 1 Nov) -----------------------------------
-- Selected colleagues, trusted colleagues or the verified network: everyone in it is asked, apart from the hard
-- stops above. The member confirms first when choosing the whole network. The width limit moves to 5,000.
do $$
declare d text;
begin
  select pg_get_functiondef('public.referral_create(jsonb)'::regprocedure) into d;
  if d is not null and strpos(d, 'array_length(cand, 1) > 500') > 0 then
    d := replace(d, 'array_length(cand, 1) > 500', 'array_length(cand, 1) > 5000');
    execute d;
  end if;
end $$;

-- 5. When a referral is placed, everyone else who was asked hears so, kindly (Nick, 1 Nov) ----------------
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conname = 'notification_events_event_type_check' and conrelid = 'public.notification_events'::regclass;
  if def is not null and position('''referral_closed''' in def) = 0 then
    execute 'alter table public.notification_events drop constraint notification_events_event_type_check';
    execute 'alter table public.notification_events add constraint notification_events_event_type_check ' || regexp_replace(def, 'ARRAY\[', 'ARRAY[''referral_closed''::text, ');
  end if;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef('public.referral_place(bigint,uuid)'::regprocedure) into d;
  if d is not null and strpos(d, 'referral_closed') = 0 then
    d := replace(d, '  return jsonb_build_object(''unchanged'', false);
end;',
'  perform private.notify_member(''referral_closed'', rr.profile_id, me,
            ''chose another colleague for this referral, based on fit. Thank you for responding; they may contact you directly.'',
            ''/dashboard/referrals?referral='' || p_referral, ''referral_closed:'' || p_referral || '':'' || rr.profile_id,
            jsonb_build_object(''referralRequestId'', p_referral))
     from referral_recipients rr
    where rr.referral_request_id = p_referral and rr.profile_id <> p_colleague;
  return jsonb_build_object(''unchanged'', false);
end;');
    execute d;
  end if;
end $$;

-- 6. Cover: interest, then the member confirms (Nick, 1 Nov) ----------------------------------------------
-- No instant agreements. A colleague who can help says they are interested; the member who asked chooses one
-- colleague per client, and the other open requests for that client close, with a kind note. This applies to
-- "one at a time" and "everyone at once" alike. An interested request no longer runs down its reply clock.
alter table public.coverage_requests add column if not exists interested_at timestamptz;

do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conname = 'notification_events_event_type_check' and conrelid = 'public.notification_events'::regclass;
  if def is not null and position('''coverage_closed''' in def) = 0 then
    execute 'alter table public.notification_events drop constraint notification_events_event_type_check';
    execute 'alter table public.notification_events add constraint notification_events_event_type_check ' || regexp_replace(def, 'ARRAY\[', 'ARRAY[''coverage_closed''::text, ');
  end if;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef('public.cover_answer(bigint,text,text,uuid)'::regprocedure) into d;
  if d is not null and strpos(d, 'interested_at') = 0 then
    d := replace(d, 'if p_response not in (''accepted'', ''declined'', ''discussing'') then',
                    'if p_response not in (''accepted'', ''interested'', ''declined'', ''discussing'') then');
    d := replace(d, '  if p_response = ''discussing'' then
    if q = '''' then',
'  -- Interest, not agreement (Nick, 1 Nov): the member who asked confirms one colleague per client.
  if p_response in (''accepted'', ''interested'') then
    if pl.status::text <> ''active'' or rq.status::text not in (''sent'', ''discussing'') then
      raise exception ''This request is closed. The colleague may have found cover elsewhere.'' using errcode = ''P0001'';
    end if;
    if cs.assigned_clinician_id is not null then
      raise exception ''Another colleague has already taken on this client, so it''''s covered. Thank you for offering.'' using errcode = ''P0001'';
    end if;
    excl := private.cover_case_exclusions(cs.id, me);
    if excl[1] like ''No reviewed %'' then
      raise exception ''Your license for % isn''''t current, so you can''''t take on this client.'', coalesce(cs.jurisdiction_state, pl.jurisdiction_state) using errcode = ''P0001'';
    end if;
    if rq.interested_at is null then
      update coverage_requests set interested_at = now(), expires_at = null, responded_at = coalesce(responded_at, now()) where id = p_request;
      perform private.professional_event(''coverage_response'', me, pl.profile_id, ''responded "interested" to a coverage request'',
                                         jsonb_build_object(''coverageRequestId'', p_request, ''response'', ''interested''));
      perform private.notify_member(''coverage_response'', pl.profile_id, me, ''is interested in covering your client'',
                                    ''/dashboard/cover?plan='' || pl.id, ''coverage_response:'' || p_request || '':interested'',
                                    jsonb_build_object(''coverageRequestId'', p_request, ''response'', ''interested''));
    end if;
    return jsonb_build_object(''status'', ''interested'', ''unchanged'', rq.interested_at is not null);
  end if;
  if p_response = ''discussing'' then
    if q = '''' then');
    execute d;
  end if;
end $$;

create or replace function public.cover_confirm(p_request bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into rq from coverage_requests where id = p_request;
  if not found then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  select * into cs from coverage_plan_cases where id = rq.coverage_plan_case_id for update;
  select * into pl from coverage_plans where id = cs.coverage_plan_id;
  if pl.profile_id <> me then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  select * into rq from coverage_requests where id = p_request;
  if rq.status::text = 'accepted' then
    return jsonb_build_object('unchanged', true);
  end if;
  if rq.interested_at is null or rq.status::text not in ('sent', 'discussing') then
    raise exception 'That colleague hasn''t said they''re interested yet.' using errcode = 'P0001';
  end if;
  if cs.assigned_clinician_id is not null then
    raise exception 'This client already has a colleague covering.' using errcode = 'P0001';
  end if;
  -- Everyone else still asked about this client hears, kindly.
  perform private.notify_member('coverage_closed', r.requested_profile_id, me,
            'found cover for this client with another colleague. Thank you for offering.',
            '/dashboard/cover?plan=' || pl.id, 'coverage_closed:' || r.id,
            jsonb_build_object('coverageRequestId', r.id))
     from coverage_requests r
    where r.coverage_plan_case_id = cs.id and r.id <> p_request and r.status::text in ('sent', 'discussing');
  -- The usual rules take it from here: the client is assigned and the other open requests close.
  update coverage_requests set status = 'accepted', responded_at = coalesce(responded_at, now()) where id = p_request;
  perform private.professional_event('coverage_confirmed', rq.requested_profile_id, me, null,
                                     jsonb_build_object('coverageRequestId', p_request, 'coveragePlanCaseId', cs.id));
  perform private.notify_member('coverage_confirmed', rq.requested_profile_id, me, 'chose you to cover their client',
                                '/dashboard/cover?plan=' || pl.id, 'coverage_confirmed:' || p_request,
                                jsonb_build_object('coverageRequestId', p_request));
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.cover_confirm(bigint) from public, anon;
grant execute on function public.cover_confirm(bigint) to authenticated;

-- The plan as the workspace sees it: an interested colleague shows as "interested", and so does the client.
do $$
declare d text;
begin
  select pg_get_functiondef(to_regproc('private.cover_plan_json')) into d;
  if d is not null and strpos(d, 'interested_at') = 0 then
    d := replace(d, '''status'', case r.status::text when ''sent'' then ''awaiting''',
                    '''status'', case when r.interested_at is not null and r.status::text in (''sent'', ''discussing'') then ''interested'' else case r.status::text when ''sent'' then ''awaiting''');
    d := replace(d, 'else r.status::text end,
                 ''order''', 'else r.status::text end end,
                 ''order''');
    d := replace(d, '      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = ''discussing'') then ''discussing''',
                    '      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.interested_at is not null and r.status in (''sent'', ''discussing'')) then ''interested''
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = ''discussing'') then ''discussing''');
    d := replace(d, '      when not own and mine.status = ''discussing'' then ''discussing''',
                    '      when not own and mine.interested_at is not null and mine.status in (''sent'', ''discussing'') then ''interested''
      when not own and mine.status = ''discussing'' then ''discussing''');
    execute d;
  end if;
end $$;

-- 7. Sandbox: the colleague whose client the guest offered to cover now chooses the guest first, then confirms
-- the handover (the same two steps a real member takes).
create or replace function public.sandbox_confirmation(p_plan bigint, p_case bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  me uuid := auth.uid();
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint; owner uuid; rid bigint; st text; chosen timestamptz;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    raise exception 'These controls are only in the sandbox.' using errcode = 'P0001';
  end if;
  select pl.profile_id, r.id, r.status::text, r.interested_at into owner, rid, st, chosen
    from coverage_plans pl
    join coverage_plan_cases c on c.coverage_plan_id = pl.id
    join coverage_requests r on r.coverage_plan_case_id = c.id and r.requested_profile_id = me
   where pl.id = p_plan and c.id = p_case and pl.profile_id <> me
     and (r.status = 'accepted' or (r.interested_at is not null and r.status in ('sent', 'discussing')))
   order by r.id desc limit 1;
  if owner is null then
    raise exception 'There is no client to confirm here.' using errcode = 'P0001';
  end if;
  select s.id into pass_id from sandbox_passes s where s.guest_id = me;
  update sandbox_passes set guest_id = null where id = pass_id;
  perform private.demo_as(owner);
  if st <> 'accepted' then
    perform public.cover_confirm(rid);
  end if;
  perform public.cover_confirm_handover(p_plan, p_case, true, true, true);
  perform private.demo_restore(saved_claims, saved_sub);
  update sandbox_passes set guest_id = me where id = pass_id;
  return jsonb_build_object('ok', true);
exception when others then
  perform private.demo_restore(saved_claims, saved_sub);
  update sandbox_passes set guest_id = me where id = pass_id and guest_id is null;
  raise;
end;
$function$;

-- 8. The sandbox story keeps its shape under "interest, then the member chooses": wherever the story has a
-- colleague agree, the member who asked now chooses them straight after.
create or replace function private.demo_cover_choose(p_plan bigint, p_label text, p_person uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare owner uuid;
begin
  select pl.profile_id into owner from coverage_plans pl where pl.id = p_plan;
  perform private.demo_as(owner);
  perform public.cover_confirm(private.demo_req(p_plan, p_label, p_person));
end;
$function$;
revoke all on function private.demo_cover_choose(bigint, text, uuid) from public, anon, authenticated;

do $$
declare d text;
begin
  select pg_get_functiondef(to_regproc('private.seed_demo_viewer')) into d;
  if d is not null and strpos(d, 'demo_cover_choose') = 0 then
    d := replace(d, 'perform public.cover_answer(private.demo_req(plan1, ''Client 1'', rena), ''accepted'');',
                    'perform public.cover_answer(private.demo_req(plan1, ''Client 1'', rena), ''accepted'');
  perform private.demo_cover_choose(plan1, ''Client 1'', rena);');
    d := replace(d, 'perform public.cover_answer(private.demo_req(plan1, ''Client 2'', maya), ''accepted'');',
                    'perform public.cover_answer(private.demo_req(plan1, ''Client 2'', maya), ''accepted'');
  perform private.demo_cover_choose(plan1, ''Client 2'', maya);');
    d := replace(d, 'perform public.cover_answer(private.demo_req(plan3, ''Client 1'', alex), ''accepted'');',
                    'perform public.cover_answer(private.demo_req(plan3, ''Client 1'', alex), ''accepted'');
  perform private.demo_cover_choose(plan3, ''Client 1'', alex);');
    d := replace(d, 'perform public.cover_answer(private.demo_req(plan4, ''Client 2'', p_viewer), ''accepted'');',
                    'perform public.cover_answer(private.demo_req(plan4, ''Client 2'', p_viewer), ''accepted'');
  perform private.demo_cover_choose(plan4, ''Client 2'', p_viewer);');
    d := replace(d, 'perform public.cover_answer(private.demo_req(plan5, ''Client 1'', p_viewer), ''accepted'');',
                    'perform public.cover_answer(private.demo_req(plan5, ''Client 1'', p_viewer), ''accepted'');
  perform private.demo_cover_choose(plan5, ''Client 1'', p_viewer);');
    if (length(d) - length(replace(d, 'demo_cover_choose', ''))) / length('demo_cover_choose') <> 5 then
      raise exception 'seed_demo_viewer did not take all five cover choices';
    end if;
    execute d;
  end if;
end $$;
