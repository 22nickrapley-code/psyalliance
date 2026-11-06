-- v4 final build: database checks for Nick's decisions of 6 November.
-- Runs on the local staging copy only, inside one transaction that is rolled back, with the fictional staging people.
--   psql ... -v ON_ERROR_STOP=1 -f e2e/staging/v4-checks.sql
-- Each check raises an exception with its ID if it fails; the last line prints "v4 checks: all passed".
begin;

create or replace function pg_temp.act(p_who text) returns void language plpgsql as $$
declare uid uuid;
begin
  perform set_config('role', 'postgres', true);
  select id into uid from profiles where full_name = p_who;
  if uid is null then raise exception 'no staging person %', p_who; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.me() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create or replace function pg_temp.pid(p_who text) returns uuid language sql as $$ select id from profiles where full_name = p_who $$;
create or replace function pg_temp.req(p_case bigint, p_who text) returns coverage_requests language sql as $$
  select * from coverage_requests where coverage_plan_case_id = p_case and requested_profile_id = pg_temp.pid(p_who) order by id desc limit 1 $$;

do $$
declare
  plan bigint; c1 bigint; r coverage_requests%rowtype; res jsonb; n integer; ref bigint; ok boolean; failed boolean;
begin
  -- V4-AI: off to start; members can't take a use while it's off; the admin switch turns it on; 20 a day.
  if (select value from app_config where key = 'ai_enabled') <> 'false' then raise exception 'V4-AI-01: AI not off by default'; end if;
  perform pg_temp.act('Avery Quillfeather');
  if (public.ai_status() ->> 'enabled')::boolean then raise exception 'V4-AI-02: ai_status says on'; end if;
  failed := false;
  begin perform public.ai_take('smart'); exception when sqlstate 'P0001' then failed := true; end;
  if not failed then raise exception 'V4-AI-03: a use was taken while AI is off'; end if;
  failed := false;
  begin perform public.admin_set_ai(true); exception when sqlstate 'P0001' then failed := true; end;
  if not failed then raise exception 'V4-AI-04: a member turned AI on'; end if;
  perform pg_temp.act('Otto Operand');
  res := public.admin_set_ai(true);
  if not (res ->> 'enabled')::boolean then raise exception 'V4-AI-05: admin switch did not turn AI on'; end if;
  perform pg_temp.act('Avery Quillfeather');
  for n in 1..20 loop perform public.ai_take(case when n % 2 = 0 then 'ask' else 'smart' end); end loop;
  if (public.ai_status() ->> 'left')::int <> 0 then raise exception 'V4-AI-06: allowance not counted'; end if;
  failed := false;
  begin perform public.ai_take('ask'); exception when sqlstate 'P0001' then failed := true; end;
  if not failed then raise exception 'V4-AI-07: a 21st use was allowed'; end if;
  perform pg_temp.act('Otto Operand');
  res := public.admin_ai_overview();
  if (res -> 'today' ->> 'uses')::int <> 20 or (res -> 'today' ->> 'atLimit')::int <> 1 then raise exception 'V4-AI-08: admin totals wrong (%)', res; end if;
  perform public.admin_set_ai(false);
  perform pg_temp.me();

  -- V4-CONFIRM: after a discussion, the colleague confirms; "not right" keeps the discussion; 24h reminder; 48h lapse.
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_create_plan(jsonb_build_object('name', 'V4 check', 'reason', 'closing', 'start', (current_date + 3)::text,
            'mode', 'parallel', 'deadline', 48, 'message', '',
            'clients', jsonb_build_array(
              jsonb_build_object('label', 'Client 1', 'focus', 'Depression', 'state', 'NY', 'setting', 'virtual',
                                 'selected', jsonb_build_array(pg_temp.pid('Bram Tellinghast'), pg_temp.pid('Cass Morrowgate'))))));
  perform pg_temp.me();
  select id into plan from coverage_plans where title = 'V4 check' order by id desc limit 1;
  if plan is null then raise exception 'V4-OPEN-01: closing-practice plan without a last day was refused'; end if;
  if (select ends_on from coverage_plans where id = plan) is not null then raise exception 'V4-OPEN-02: an end date was invented'; end if;
  if not (private.cover_plan_json(plan, pg_temp.pid('Avery Quillfeather')) ->> 'openEnded')::boolean then raise exception 'V4-OPEN-03: openEnded not shown'; end if;
  select id into c1 from coverage_plan_cases where coverage_plan_id = plan;
  if private.cover_request_text(plan, c1) not like '%until further notice%' then raise exception 'V4-OPEN-04: invitation text %', private.cover_request_text(plan, c1); end if;

  r := pg_temp.req(c1, 'Bram Tellinghast');
  perform pg_temp.act('Bram Tellinghast');
  perform public.cover_answer(r.id, 'discussing', 'Mornings only?', null);
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_confirm(r.id);
  perform pg_temp.act('Bram Tellinghast');
  res := public.cover_agreement_reply(r.id, false);
  perform pg_temp.me();
  r := pg_temp.req(c1, 'Bram Tellinghast');
  if r.owner_agreed_at is not null or r.status::text <> 'discussing' then raise exception 'V4-CONFIRM-03: "not right" did not leave the discussion open'; end if;
  if (select assigned_clinician_id from coverage_plan_cases where id = c1) is not null then raise exception 'V4-CONFIRM-04: assigned after "not right"'; end if;

  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_confirm(r.id);
  perform pg_temp.me();
  update coverage_requests set owner_agreed_at = now() - interval '25 hours' where id = r.id;
  perform private.agreement_deadlines();
  if (select confirm_reminded_at from coverage_requests where id = r.id) is null then raise exception 'V4-CONFIRM-05: no 24-hour reminder'; end if;
  if (select confirm_lapsed_at from coverage_requests where id = r.id) is not null then raise exception 'V4-CONFIRM-06: lapsed too early'; end if;
  update coverage_requests set owner_agreed_at = now() - interval '49 hours' where id = r.id;
  perform private.agreement_deadlines();
  r := pg_temp.req(c1, 'Bram Tellinghast');
  if r.confirm_lapsed_at is null then raise exception 'V4-CONFIRM-07: no 48-hour lapse'; end if;
  if r.status::text <> 'discussing' or (select assigned_clinician_id from coverage_plan_cases where id = c1) is not null then
    raise exception 'V4-CONFIRM-08: something moved on by itself after 48 hours';
  end if;
  if (private.cover_plan_json(plan, pg_temp.pid('Avery Quillfeather')) -> 'clients' -> 0 -> 'requests' -> 0 ->> 'confirmLapsed')::boolean is not true then
    raise exception 'V4-CONFIRM-09: the lapse is not shown on the plan';
  end if;
  -- Ask again
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_confirm(r.id);
  perform pg_temp.me();
  if (pg_temp.req(c1, 'Bram Tellinghast')).confirm_lapsed_at is not null then raise exception 'V4-CONFIRM-10: Ask again did not restart'; end if;

  -- Cass said "I can cover": choosing her is immediate (both sides have said yes).
  r := pg_temp.req(c1, 'Cass Morrowgate');
  perform pg_temp.act('Cass Morrowgate');
  perform public.cover_answer(r.id, 'interested', null, null);
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_confirm(r.id);
  perform pg_temp.me();
  if (select assigned_clinician_id from coverage_plan_cases where id = c1) is distinct from pg_temp.pid('Cass Morrowgate') then
    raise exception 'V4-CONFIRM-11: choosing a colleague who offered was not immediate';
  end if;
  if (pg_temp.req(c1, 'Bram Tellinghast')).status::text in ('sent', 'discussing') then raise exception 'V4-CONFIRM-12: Bram''s pending agreement stayed open'; end if;

  -- V4-CHANGE: change details on the plan; the agreed colleague is told; main need can't change; End this cover.
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_change_details(plan, jsonb_build_object('end', (current_date + 40)::text, 'clients',
            jsonb_build_array(jsonb_build_object('id', c1, 'age', 'Adults', 'prescribing', true))));
  perform pg_temp.me();
  if res ->> 'unchanged' <> 'false' or (select ends_on from coverage_plans where id = plan) <> current_date + 40 then raise exception 'V4-CHANGE-01: dates not changed (%)', res; end if;
  if not (select prescribing_needed from coverage_plan_cases where id = c1) then raise exception 'V4-CHANGE-02: client need not changed'; end if;
  if not exists (select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id
                  where d.recipient_profile_id = pg_temp.pid('Cass Morrowgate') and e.dedup_key like 'cover_change:' || plan || ':%') then
    raise exception 'V4-CHANGE-03: the agreed colleague was not told';
  end if;
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_change_details(plan, jsonb_build_object('end', ''));
  perform pg_temp.me();
  if (select ends_on from coverage_plans where id = plan) is not null then raise exception 'V4-CHANGE-04: could not go back to until further notice'; end if;
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_end_plan(plan);
  perform pg_temp.me();
  if (select ends_on from coverage_plans where id = plan) is null then raise exception 'V4-OPEN-05: End this cover set no last day'; end if;

  -- V4-REF: referral change details, colleague confirmation, Close; whole-network sends wait in a founding-circle state.
  perform pg_temp.act('Avery Quillfeather');
  failed := false;
  begin
    perform public.referral_create(jsonb_build_object('focus', 'Depression', 'state', 'NY', 'setting', 'virtual', 'audience', 'network',
              'timeframe', 'Within a month', 'mode', 'parallel', 'deadline', 48));
  exception when sqlstate 'P0001' then failed := true; end;
  if not failed then raise exception 'V4-CIRCLE-01: a whole-network referral went out in a founding-circle state'; end if;
  res := public.referral_create(jsonb_build_object('focus', 'Depression', 'state', 'NY', 'setting', 'virtual', 'audience', 'selected',
            'selected', jsonb_build_array(pg_temp.pid('Bram Tellinghast')), 'timeframe', 'Within a month', 'mode', 'parallel', 'deadline', 48));
  ref := (res ->> 'referralId')::bigint;
  res := public.referral_change_details(ref, jsonb_build_object('timeframe', 'As soon as possible', 'age', 'Adults'));
  perform pg_temp.me();
  if (select timeframe from referral_requests where id = ref) <> 'urgent' or (select details_changed_at from referral_requests where id = ref) is null then
    raise exception 'V4-REF-01: referral details not changed (%)', res;
  end if;
  perform pg_temp.act('Avery Quillfeather');
  failed := false;
  begin perform public.referral_close(ref); exception when sqlstate 'P0001' then failed := true; end;
  if not failed then raise exception 'V4-REF-02: an open referral was closed'; end if;
  perform pg_temp.act('Bram Tellinghast');
  perform public.referral_answer(ref, 'interested', true, null, null);
  perform pg_temp.act('Avery Quillfeather');
  res := public.referral_place(ref, pg_temp.pid('Bram Tellinghast'));
  perform pg_temp.me();
  if coalesce((res ->> 'pending')::boolean, false) or (select status::text from referral_requests where id = ref) <> 'connected' then
    raise exception 'V4-REF-03: choosing a colleague who offered was not immediate (%)', res;
  end if;
  perform pg_temp.act('Avery Quillfeather');
  perform public.referral_close(ref);
  perform pg_temp.me();
  if (private.referral_json(ref, pg_temp.pid('Avery Quillfeather')) ->> 'closedByOwnerAt') is null then raise exception 'V4-REF-04: Close not recorded'; end if;

  -- V4-MEMBER: founding places start again from zero and are given on activation; Pell (not verified) can't activate.
  if exists (select 1 from founding_places) then raise exception 'V4-MEMBER-01: founding places did not start from zero'; end if;
  perform pg_temp.act('Pell Ardenwick');
  failed := false;
  begin perform public.activate_membership('NY'); exception when sqlstate 'P0001' then failed := true; end;
  if not failed then raise exception 'V4-MEMBER-02: an unverified member activated'; end if;
  perform pg_temp.act('Bram Tellinghast');
  res := public.activate_membership('NY');
  perform pg_temp.act('Avery Quillfeather');
  res := public.activate_membership('NY');
  perform pg_temp.me();
  if res ->> 'plan' <> 'founding' or (res ->> 'priceCents')::int <> 3000 then raise exception 'V4-MEMBER-03: activation result %', res; end if;
  -- Avery and Bram were approved before v4: their places follow original approval order, not activation order.
  if (select array_agg(profile_id order by place) from founding_places where state = 'NY')
     <> (select array_agg(id order by founding_priority_at, id) from profiles where id in (pg_temp.pid('Avery Quillfeather'), pg_temp.pid('Bram Tellinghast'))) then
    raise exception 'V4-MEMBER-04: places not in original approval order';
  end if;
  -- When the state's 40 places are taken, the next member is standard at $30 a month.
  insert into founding_places (state, place, profile_id, granted_at)
  select 'NY', g, null, now() from generate_series(3, 40) g;
  perform pg_temp.act('Cass Morrowgate');
  res := public.activate_membership('NY');
  perform pg_temp.me();
  if res ->> 'plan' <> 'standard' then raise exception 'V4-MEMBER-05: a 41st member got a founding place (%)', res; end if;

  -- V4-STILL: "Still correct" sets the yearly review date.
  insert into continuity_plans (profile_id, answers) values (pg_temp.pid('Gale Thistlewood'), '{}'::jsonb) on conflict (profile_id) do nothing;
  update continuity_plans set reviewed_at = now() - interval '400 days' where profile_id = pg_temp.pid('Gale Thistlewood');
  perform pg_temp.act('Gale Thistlewood');
  perform public.continuity_still_correct();
  perform pg_temp.me();
  if (select reviewed_at from continuity_plans where profile_id = pg_temp.pid('Gale Thistlewood')) < now() - interval '1 minute' then
    raise exception 'V4-STILL-01: Still correct did not record the review';
  end if;

  raise notice 'v4 checks: all passed';
end $$;

rollback;
