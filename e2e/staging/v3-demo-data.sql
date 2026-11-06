-- v3 screens: a fictional Cover plan and referrals on the local staging copy, in every state the new screens show.
-- Staging only. Run after `stage.sh rebuild`:  psql ... -v ON_ERROR_STOP=1 -f e2e/staging/v3-demo-data.sql
create or replace function pg_temp.act(p_who text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from profiles where full_name = p_who;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create or replace function pg_temp.me() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', false); perform set_config('request.jwt.claims', '', false); end $$;
create or replace function pg_temp.pid(p_who text) returns uuid language sql as $$ select id from profiles where full_name = p_who $$;
create or replace function pg_temp.rq(p_plan bigint, p_label text, p_who text) returns bigint language sql as $$
  select r.id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id
   where c.coverage_plan_id = p_plan and c.case_reference = p_label and r.requested_profile_id = pg_temp.pid(p_who) order by r.id desc limit 1 $$;

do $$
declare plan bigint; ref bigint; res jsonb; c6 bigint;
begin
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_create_plan(jsonb_build_object('name', 'Maternity', 'reason', 'extended', 'start', (current_date + 18)::text,
            'end', (current_date + 54)::text, 'mode', 'sequential', 'deadline', 48, 'message', 'Weekly sessions, mostly virtual.',
            'clients', (select jsonb_agg(jsonb_build_object('label', 'Client ' || i, 'focus', 'Depression', 'state', 'NY', 'setting', 'virtual',
                         'selected', case i
                           when 1 then jsonb_build_array(pg_temp.pid('Bram Tellinghast'))
                           when 2 then jsonb_build_array(pg_temp.pid('Cass Morrowgate'), pg_temp.pid('Fenn Oakhollow'))
                           when 3 then jsonb_build_array(pg_temp.pid('Fenn Oakhollow'), pg_temp.pid('Gale Thistlewood'), pg_temp.pid('Bram Tellinghast'))
                           when 4 then jsonb_build_array(pg_temp.pid('Gale Thistlewood'))
                           when 5 then jsonb_build_array(pg_temp.pid('Cass Morrowgate'))
                           else jsonb_build_array(pg_temp.pid('Bram Tellinghast')) end)) from generate_series(1, 6) i)));
  plan := (res ->> 'planId')::bigint;
  perform pg_temp.me();
  if plan is null then select id into plan from coverage_plans where title = 'Maternity' order by id desc limit 1; end if;
  -- Client 1: Bram can cover. Client 2: Cass asked a question. Client 3: Fenn asked, two queued.
  perform pg_temp.act('Bram Tellinghast'); perform public.cover_answer(pg_temp.rq(plan, 'Client 1', 'Bram Tellinghast'), 'interested', null, null);
  perform pg_temp.act('Cass Morrowgate'); perform public.cover_answer(pg_temp.rq(plan, 'Client 2', 'Cass Morrowgate'), 'discussing', 'Is a Tuesday start possible?', null);
  -- Client 4: agreed and handed over. Client 5: agreed, handover to confirm. Client 6: Bram said not available.
  perform pg_temp.act('Gale Thistlewood'); perform public.cover_answer(pg_temp.rq(plan, 'Client 4', 'Gale Thistlewood'), 'interested', null, null);
  perform pg_temp.act('Cass Morrowgate'); perform public.cover_answer(pg_temp.rq(plan, 'Client 5', 'Cass Morrowgate'), 'interested', null, null);
  perform pg_temp.act('Bram Tellinghast'); perform public.cover_answer(pg_temp.rq(plan, 'Client 6', 'Bram Tellinghast'), 'declined', null, null);
  perform pg_temp.act('Avery Quillfeather');
  perform public.cover_confirm(pg_temp.rq(plan, 'Client 4', 'Gale Thistlewood'));
  perform public.cover_confirm(pg_temp.rq(plan, 'Client 5', 'Cass Morrowgate'));
  select id into c6 from coverage_plan_cases where coverage_plan_id = plan and case_reference = 'Client 4';
  perform public.cover_confirm_handover(plan, c6, true, true, true);
  -- A referral one at a time: Bram asked first, Cass and Fenn waiting.
  res := public.referral_create(jsonb_build_object('focus', 'Depression', 'state', 'NY', 'setting', 'virtual', 'audience', 'selected', 'title', 'Evening sessions',
            'selected', jsonb_build_array(pg_temp.pid('Bram Tellinghast'), pg_temp.pid('Cass Morrowgate'), pg_temp.pid('Fenn Oakhollow')),
            'timeframe', 'Within a month', 'mode', 'sequential', 'deadline', 48));
  ref := (res ->> 'referralId')::bigint;
  perform pg_temp.act('Bram Tellinghast'); perform public.referral_answer(ref, 'interested', true, null, null);
  -- A referral sent to Avery by Gale.
  perform pg_temp.act('Gale Thistlewood');
  res := public.referral_create(jsonb_build_object('focus', 'Depression', 'state', 'NY', 'setting', 'virtual', 'audience', 'selected',
            'selected', jsonb_build_array(pg_temp.pid('Avery Quillfeather')), 'timeframe', 'Within two weeks', 'mode', 'parallel', 'deadline', 72));
  perform pg_temp.me();
  raise notice 'demo data: plan % referral %', plan, ref;
end $$;
