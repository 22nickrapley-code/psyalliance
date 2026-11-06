-- v3 corrective release: database checks for the agreed invitation workflow (Nick's addendum of 4 Nov).
-- Runs on the local staging copy only, inside one transaction that is rolled back, with the fictional staging people.
--   psql ... -v ON_ERROR_STOP=1 -f e2e/staging/v3-workflow-checks.sql
-- Each check raises an exception with its ID if it fails; the last line prints "v3 workflow checks: all passed".
begin;

create or replace function pg_temp.act(p_who text) returns void language plpgsql as $$
declare uid uuid;
begin
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
  plan bigint; c1 bigint; c2 bigint; r coverage_requests%rowtype; res jsonb; ok boolean; n integer; ref bigint;
begin
  -- A plan with two NY clients, one at a time. Client 1 asks Bram then Cass; Client 2 asks Fenn.
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_create_plan(jsonb_build_object('name', 'V3 check', 'reason', 'extended', 'start', (current_date + 7)::text,
            'end', (current_date + 30)::text, 'mode', 'sequential', 'deadline', 48, 'message', '',
            'clients', jsonb_build_array(
              jsonb_build_object('label', 'Client 1', 'focus', 'Depression', 'state', 'NY', 'setting', 'virtual',
                                 'selected', jsonb_build_array(pg_temp.pid('Bram Tellinghast'), pg_temp.pid('Cass Morrowgate'))),
              jsonb_build_object('label', 'Client 2', 'focus', 'Depression', 'state', 'NY', 'setting', 'virtual',
                                 'selected', jsonb_build_array(pg_temp.pid('Fenn Oakhollow'))))));
  perform pg_temp.me();
  select id into plan from coverage_plans where title = 'V3 check' order by id desc limit 1;
  select id into c1 from coverage_plan_cases where coverage_plan_id = plan and case_reference = 'Client 1';
  select id into c2 from coverage_plan_cases where coverage_plan_id = plan and case_reference = 'Client 2';
  if plan is null or c1 is null then raise exception 'SETUP: plan was not created'; end if;
  if (pg_temp.req(c1, 'Cass Morrowgate')).id is not null then raise exception 'V3-SEQ-01: Cass was asked before Bram answered'; end if;

  -- V3-AGREE-01: Bram asks a question; Avery records the agreement without Bram pressing anything.
  r := pg_temp.req(c1, 'Bram Tellinghast');
  perform pg_temp.act('Bram Tellinghast');
  perform public.cover_answer(r.id, 'discussing', 'Could we talk about the start date?', null);
  perform pg_temp.me();
  if (pg_temp.req(c1, 'Cass Morrowgate')).id is not null then raise exception 'V3-SEQ-02: a question did not pause the sequence'; end if;
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_confirm(r.id);
  perform pg_temp.me();
  -- v4 (Nick, 6 Nov): after a discussion alone, Bram confirms with one tap before it counts.
  if not coalesce((res ->> 'pending')::boolean, false) then raise exception 'V4-CONFIRM-01: agreement after discussion did not wait for the colleague (%)', res; end if;
  if (select assigned_clinician_id from coverage_plan_cases where id = c1) is not null then raise exception 'V4-CONFIRM-02: client assigned before the colleague confirmed'; end if;
  perform pg_temp.act('Bram Tellinghast');
  res := public.cover_agreement_reply(r.id, true);
  perform pg_temp.me();
  select assigned_clinician_id = pg_temp.pid('Bram Tellinghast') into ok from coverage_plan_cases where id = c1;
  if not coalesce(ok, false) then raise exception 'V3-AGREE-01: agreement after discussion did not assign the client'; end if;
  if (select array_length(outreach_queue, 1) from coverage_plan_cases where id = c1) is not null then raise exception 'V3-AGREE-02: queue not cleared after agreement'; end if;
  if (select status from coverage_plan_cases where id = c2)::text = 'confirmed' then raise exception 'V3-AGREE-03: another client was affected'; end if;

  -- V3-DECLINE-01: Avery declines Fenn on Client 2 after adding Gale and Dara-free list; Gale is asked next.
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_set_recipients(plan, c2, array[pg_temp.pid('Gale Thistlewood'), pg_temp.pid('Cass Morrowgate')], 'sequential');
  perform pg_temp.me();
  if (res ->> 'sent')::int <> 0 or (res ->> 'queued')::int <> 2 then raise exception 'V3-ADD-01: adding while Fenn is asked should queue both (%).', res; end if;
  perform pg_temp.act('Avery Quillfeather');
  res := public.cover_set_recipients(plan, c2, array[pg_temp.pid('Cass Morrowgate'), pg_temp.pid('Gale Thistlewood')], 'sequential');
  res := public.cover_decline((pg_temp.req(c2, 'Fenn Oakhollow')).id);
  perform pg_temp.me();
  if res ->> 'next' is distinct from pg_temp.pid('Cass Morrowgate')::text then raise exception 'V3-ORDER-01: reordering did not decide who is next (%)', res; end if;
  r := pg_temp.req(c2, 'Fenn Oakhollow');
  if r.status::text <> 'declined' or r.closed_reason <> 'owner' then raise exception 'V3-DECLINE-01: Fenn''s invitation not closed by the organizer'; end if;
  if (select outreach_queue from coverage_plan_cases where id = c2) <> array[pg_temp.pid('Gale Thistlewood')] then raise exception 'V3-ORDER-02: queue after moving on is wrong'; end if;

  -- V3-R03-01: Cass offers, then her NY license loses review; choosing her fails and changes nothing.
  r := pg_temp.req(c2, 'Cass Morrowgate');
  perform pg_temp.act('Cass Morrowgate');
  perform public.cover_answer(r.id, 'interested', null, null);
  perform pg_temp.me();
  update licenses set reviewed_at = null, reviewed_by = null where profile_id = pg_temp.pid('Cass Morrowgate');
  begin
    perform pg_temp.act('Avery Quillfeather');
    perform public.cover_confirm(r.id);
    perform pg_temp.me();
    raise exception 'V3-R03-01: a colleague without a current license was chosen';
  exception when sqlstate 'P0001' then
    perform pg_temp.me();
    if sqlerrm like 'V3-R03-01%' then raise; end if;
  end;
  if (select assigned_clinician_id from coverage_plan_cases where id = c2) is not null then raise exception 'V3-R03-02: partial assignment after a failed choice'; end if;
  if (pg_temp.req(c2, 'Cass Morrowgate')).status::text <> 'sent' then raise exception 'V3-R03-03: the failed choice changed the invitation'; end if;
  update licenses set reviewed_at = now() where profile_id = pg_temp.pid('Cass Morrowgate');

  -- V3-EXPIRY-01: a deadline passing on Cass's offer must not agree anything (offers pause the clock).
  update coverage_requests set expires_at = now() - interval '1 minute' where id = r.id;
  perform private.cover_process_deadlines();
  if (select assigned_clinician_id from coverage_plan_cases where id = c2) is not null then raise exception 'V3-EXPIRY-01: expiry created an agreement'; end if;

  -- V3-ARR-01: Confirm cover arranged needs every client agreed and handed over.
  begin
    perform pg_temp.act('Avery Quillfeather');
    perform public.cover_mark_arranged(plan);
    perform pg_temp.me();
    raise exception 'V3-ARR-01: plan marked arranged with a client still open';
  exception when sqlstate 'P0001' then perform pg_temp.me(); if sqlerrm like 'V3-ARR-01%' then raise; end if;
  end;

  -- V3-AUTO-01: a plan whose last day has passed moves to history by itself; open invitations close.
  update coverage_plans set starts_on = current_date - 20, ends_on = current_date - 2 where id = plan;
  perform private.cover_process_deadlines();
  if (select status::text from coverage_plans where id = plan) <> 'completed' or not (select auto_completed from coverage_plans where id = plan) then
    raise exception 'V3-AUTO-01: ended plan was not moved to history';
  end if;
  if exists (select 1 from coverage_requests q join coverage_plan_cases c on c.id = q.coverage_plan_case_id where c.coverage_plan_id = plan and q.status in ('sent', 'discussing')) then
    raise exception 'V3-AUTO-02: open invitations survived the end of the absence';
  end if;
  if (select assigned_clinician_id from coverage_plan_cases where id = c1) is null then raise exception 'V3-AUTO-03: the agreement was lost'; end if;

  -- Referrals: one at a time to Bram then Cass, 24-hour deadline.
  perform pg_temp.act('Avery Quillfeather');
  res := public.referral_create(jsonb_build_object('focus', 'Depression', 'state', 'NY', 'setting', 'virtual', 'audience', 'selected',
            'selected', jsonb_build_array(pg_temp.pid('Bram Tellinghast'), pg_temp.pid('Cass Morrowgate')), 'timeframe', 'Within a month',
            'mode', 'sequential', 'deadline', 24));
  perform pg_temp.me();
  ref := (res ->> 'referralId')::bigint;
  select count(*) into n from referral_recipients where referral_request_id = ref;
  if n <> 1 then raise exception 'V3-RSEQ-01: one at a time sent % invitations', n; end if;
  if (select expires_at from referral_recipients where referral_request_id = ref and profile_id = pg_temp.pid('Bram Tellinghast')) is null then
    raise exception 'V3-RSEQ-02: no reply deadline on the referral invitation';
  end if;
  -- Bram is not available: Cass is asked next.
  perform pg_temp.act('Bram Tellinghast');
  perform public.referral_answer(ref, 'declined', false, null, null);
  perform pg_temp.me();
  if not exists (select 1 from referral_recipients where referral_request_id = ref and profile_id = pg_temp.pid('Cass Morrowgate')) then
    raise exception 'V3-RSEQ-03: Not available did not ask the next colleague';
  end if;
  -- Cass asks a question; Avery agrees the referral after the discussion.
  perform pg_temp.act('Cass Morrowgate');
  perform public.referral_answer(ref, 'discussing', false, 'Is the client OK with mornings?', null);
  perform pg_temp.me();
  perform pg_temp.act('Avery Quillfeather');
  res := public.referral_place(ref, pg_temp.pid('Cass Morrowgate'));
  perform pg_temp.me();
  -- v4 (Nick, 6 Nov): Cass confirms before the referral is placed.
  if not coalesce((res ->> 'pending')::boolean, false) then raise exception 'V4-RCONFIRM-01: referral agreed after discussion did not wait for the colleague (%)', res; end if;
  if exists (select 1 from referral_responses where referral_request_id = ref and status = 'accepted') then raise exception 'V4-RCONFIRM-02: placed before the colleague confirmed'; end if;
  perform pg_temp.act('Cass Morrowgate');
  res := public.referral_agreement_reply(ref, true);
  perform pg_temp.me();
  if not exists (select 1 from referral_responses where referral_request_id = ref and responding_profile_id = pg_temp.pid('Cass Morrowgate') and status = 'accepted') then
    raise exception 'V3-RAGREE-01: referral agreement after a discussion failed';
  end if;

  -- A deadline passing on a referral closes that invitation and asks the next colleague.
  perform pg_temp.act('Avery Quillfeather');
  res := public.referral_create(jsonb_build_object('focus', 'Depression', 'state', 'NY', 'setting', 'virtual', 'audience', 'selected',
            'selected', jsonb_build_array(pg_temp.pid('Fenn Oakhollow'), pg_temp.pid('Gale Thistlewood')), 'timeframe', 'Within a month',
            'mode', 'sequential', 'deadline', 6));
  perform pg_temp.me();
  ref := (res ->> 'referralId')::bigint;
  update referral_recipients set expires_at = now() - interval '1 minute' where referral_request_id = ref;
  perform private.cover_process_deadlines();
  if (select closed_reason from referral_recipients where referral_request_id = ref and profile_id = pg_temp.pid('Fenn Oakhollow')) is distinct from 'deadline' then
    raise exception 'V3-REXP-01: the referral deadline did not close the invitation';
  end if;
  if not exists (select 1 from referral_recipients where referral_request_id = ref and profile_id = pg_temp.pid('Gale Thistlewood')) then
    raise exception 'V3-REXP-02: the next colleague was not asked after the deadline';
  end if;
  -- A late reply from Fenn is refused.
  begin
    perform pg_temp.act('Fenn Oakhollow');
    perform public.referral_answer(ref, 'interested', true, null, null);
    perform pg_temp.me();
    raise exception 'V3-REXP-03: a reply after the deadline was accepted';
  exception when sqlstate 'P0001' then perform pg_temp.me(); if sqlerrm like 'V3-REXP-03%' then raise; end if;
  end;
  -- The organizer declines Gale: the queue is empty, nothing else is sent, the referral stays open.
  perform pg_temp.act('Avery Quillfeather');
  res := public.referral_decline(ref, pg_temp.pid('Gale Thistlewood'));
  perform pg_temp.me();
  if res ->> 'next' is not null then raise exception 'V3-RDEC-01: something was sent with an empty queue'; end if;
  if (select status::text from referral_requests where id = ref) not in ('open', 'sent', 'matched') then raise exception 'V3-RDEC-02: referral closed by declining'; end if;
  raise notice 'v3 workflow checks: all passed';
end $$;
rollback;
