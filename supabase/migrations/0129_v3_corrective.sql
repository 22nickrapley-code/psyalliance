-- PsyAlliance v3: the corrective release (Nick's addendum of 4 November). Safe to run more than once.
--
-- What this file does, in order:
--   1. New columns: who closed an invitation, per-client outreach mode, "cover arranged", referral sequencing and deadlines.
--   2. Cover: agreeing after a discussion (with the current license rechecked, R03), declining a colleague and moving on,
--      adding recipients and reordering the unsent ones, "Confirm cover arranged", and plans that move to history by
--      themselves the day after the absence ends.
--   3. Referrals: one at a time in your order (selected or trusted colleagues), the same deadlines as Cover, agreeing after
--      a discussion, declining a colleague and moving on, adding recipients.
--   4. What the screens read: the plan and referral records carry the new facts, and notifications use the same
--      words as the screens (can cover, can accept, not available, agreed).
--   5. Consultation groups list who was invited and has not joined yet (organisers only); the Network knows when you
--      last worked with each colleague, for the recency filter.
--   6. Who can call the new functions.
-- Every function is written out in full (no find-and-replace on live text), so the result is the same on every project.

-- 1. Columns ------------------------------------------------------------------------------------------------------
alter table public.coverage_requests drop constraint if exists coverage_requests_closed_reason_check;
alter table public.coverage_requests add constraint coverage_requests_closed_reason_check
  check (closed_reason is null or closed_reason in ('deadline', 'competing', 'plan_ended', 'owner'));

alter table public.coverage_plan_cases add column if not exists outreach_mode text;
alter table public.coverage_plan_cases drop constraint if exists coverage_plan_cases_outreach_mode_check;
alter table public.coverage_plan_cases add constraint coverage_plan_cases_outreach_mode_check
  check (outreach_mode is null or outreach_mode in ('sequential', 'parallel'));

alter table public.coverage_plans add column if not exists arranged_at timestamptz;
alter table public.coverage_plans add column if not exists auto_completed boolean not null default false;

alter table public.referral_requests add column if not exists outreach_mode text not null default 'parallel';
alter table public.referral_requests add column if not exists response_hours integer;
alter table public.referral_requests add column if not exists outreach_queue uuid[] not null default '{}';
alter table public.referral_requests drop constraint if exists referral_requests_outreach_mode_check;
alter table public.referral_requests add constraint referral_requests_outreach_mode_check check (outreach_mode in ('sequential', 'parallel'));
alter table public.referral_requests drop constraint if exists referral_requests_response_hours_check;
alter table public.referral_requests add constraint referral_requests_response_hours_check
  check (response_hours is null or response_hours in (6, 12, 24, 48, 72, 168));

alter table public.referral_recipients add column if not exists expires_at timestamptz;
alter table public.referral_recipients add column if not exists closed_reason text;
alter table public.referral_recipients add column if not exists closed_at timestamptz;
alter table public.referral_recipients drop constraint if exists referral_recipients_closed_reason_check;
alter table public.referral_recipients add constraint referral_recipients_closed_reason_check
  check (closed_reason is null or closed_reason in ('deadline', 'owner'));
create index if not exists referral_recipients_deadline_idx on public.referral_recipients (expires_at)
  where expires_at is not null and closed_reason is null;

-- 2. Cover --------------------------------------------------------------------------------------------------------

-- Sends one cover invitation now: the request, the client's status, the event and the colleague's notification.
create or replace function private.cover_send_one(p_plan bigint, p_case bigint, p_person uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pl coverage_plans%rowtype;
  rid bigint;
begin
  select * into pl from coverage_plans where id = p_plan;
  perform set_config('pa.cover_retry', 'on', true);
  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, message)
  values (p_case, p_person, (select coalesce(max(sequence_order), 0) + 1 from coverage_requests where coverage_plan_case_id = p_case), nullif(pl.notes, ''))
  returning id into rid;
  perform set_config('pa.cover_retry', 'off', true);
  update coverage_plan_cases set status = 'awaiting_response' where id = p_case and assigned_clinician_id is null;
  perform private.professional_event('coverage_request_sent', pl.profile_id, p_person, 'sent a coverage request',
                                     jsonb_build_object('coveragePlanCaseId', p_case, 'coverageRequestId', rid));
  perform private.notify_member('coverage_request', p_person, pl.profile_id, 'sent you a coverage request',
                                '/dashboard/cover?plan=' || pl.id, 'coverage_request:' || rid,
                                jsonb_build_object('coveragePlanCaseId', p_case, 'coverageRequestId', rid));
  return rid;
end;
$$;
revoke all on function private.cover_send_one(bigint, bigint, uuid) from public, anon, authenticated;

-- The member who asked records the agreement: after a colleague said "I can cover", or after a discussion, without
-- the colleague having to come back and press a button (Nick, 4 Nov). The colleague's current reviewed license for
-- this client's state is checked here, in the same transaction, before anything changes (R03).
create or replace function public.cover_confirm(p_request bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
  excl text[];
  who text;
  others uuid[];
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
  who := private.member_name(rq.requested_profile_id);
  if rq.status::text = 'accepted' then
    return jsonb_build_object('unchanged', true);
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended, so nobody can be chosen now.' using errcode = 'P0001';
  end if;
  if rq.status::text not in ('sent', 'discussing') then
    raise exception 'The invitation to % has closed, so they can''t be chosen now. Use Add recipients to ask them again.', who using errcode = 'P0001';
  end if;
  if cs.assigned_clinician_id is not null then
    raise exception 'This client already has a colleague covering.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can agree cover.' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, rq.requested_profile_id) then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  if not private.is_active_clinician(rq.requested_profile_id) or not private.is_network_member(rq.requested_profile_id) then
    raise exception '% can''t take on cover right now: their account or license isn''t current. Nothing was changed.', who using errcode = 'P0001';
  end if;
  excl := array(select x from unnest(private.cover_case_exclusions(cs.id, rq.requested_profile_id)) x
                 where x like 'No reviewed %' or x like 'Not a colleague%');
  if array_length(excl, 1) is not null then
    raise exception '% can''t be chosen for %: %. Nothing was changed.', who, cs.case_reference, excl[1] using errcode = 'P0001';
  end if;
  select coalesce(array_agg(r.requested_profile_id), '{}') into others
    from coverage_requests r where r.coverage_plan_case_id = cs.id and r.id <> p_request and r.status::text in ('sent', 'discussing');
  -- The usual rules take it from here: the client is assigned and the other open requests close.
  update coverage_requests set status = 'accepted', responded_at = coalesce(responded_at, now()), expires_at = null where id = p_request;
  -- Nobody else is asked about this client. Other clients in the plan are untouched.
  update coverage_plan_cases set outreach_queue = '{}' where id = cs.id;
  perform private.notify_member('coverage_closed', o, me,
            'found cover for this client with another colleague. Thank you for offering.',
            '/dashboard/cover?plan=' || pl.id, 'coverage_closed:' || cs.id || ':' || o,
            jsonb_build_object('coveragePlanCaseId', cs.id))
     from unnest(others) o;
  perform private.professional_event('coverage_confirmed', rq.requested_profile_id, me, null,
                                     jsonb_build_object('coverageRequestId', p_request, 'coveragePlanCaseId', cs.id));
  perform private.notify_member('coverage_confirmed', rq.requested_profile_id, me, 'agreed cover with you for their client',
                                '/dashboard/cover?plan=' || pl.id, 'coverage_confirmed:' || p_request,
                                jsonb_build_object('coverageRequestId', p_request));
  return jsonb_build_object('unchanged', false);
end;
$$;

-- "Decline and continue search": the member who asked closes one colleague's invitation; if anyone is queued for
-- this client, the next one is asked straight away (the usual queue rules).
create or replace function public.cover_decline(p_request bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
  nxt uuid;
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
  if rq.status::text = 'declined' and rq.closed_reason = 'owner' then
    return jsonb_build_object('unchanged', true);
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended.' using errcode = 'P0001';
  end if;
  if rq.status::text not in ('sent', 'discussing') then
    raise exception 'This invitation has already closed.' using errcode = 'P0001';
  end if;
  if cs.assigned_clinician_id is not null then
    raise exception 'This client already has a colleague covering.' using errcode = 'P0001';
  end if;
  update coverage_requests set status = 'declined', closed_reason = 'owner', expires_at = null, responded_at = coalesce(responded_at, now())
   where id = p_request;
  perform private.notify_member('coverage_closed', rq.requested_profile_id, me,
            'has made other arrangements for this client. Thank you for your time.',
            '/dashboard/cover?plan=' || pl.id, 'coverage_closed:' || p_request,
            jsonb_build_object('coverageRequestId', p_request));
  select r.requested_profile_id into nxt from coverage_requests r
   where r.coverage_plan_case_id = cs.id and r.status = 'sent' and r.id > p_request order by r.id desc limit 1;
  return jsonb_build_object('unchanged', false, 'next', nxt, 'nextName', case when nxt is not null then private.member_name(nxt) end);
end;
$$;

-- "Add recipients": the member sets the client's whole unsent list (new people and anyone still queued) in the order
-- they want, and whether it goes one at a time or to everyone at once. Invitations already delivered are never resent
-- or recalled; replies and conversations stay as they are.
create or replace function public.cover_set_recipients(p_plan bigint, p_case bigint, p_people uuid[], p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  cs coverage_plan_cases%rowtype;
  pid uuid;
  excl text[];
  list uuid[] := '{}';
  asked integer;
  busy boolean;
  sent integer := 0;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if coalesce(p_mode, '') not in ('sequential', 'parallel') then
    raise exception 'Choose one at a time or everyone at once.' using errcode = 'P0001';
  end if;
  select * into pl from coverage_plans where id = p_plan and profile_id = me;
  if not found then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  select * into cs from coverage_plan_cases where id = p_case and coverage_plan_id = p_plan for update;
  if not found then
    raise exception 'Client not found.' using errcode = 'P0001';
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended.' using errcode = 'P0001';
  end if;
  if cs.assigned_clinician_id is not null then
    raise exception 'This client already has cover.' using errcode = 'P0001';
  end if;
  foreach pid in array coalesce(p_people, '{}') loop
    continue when pid is null or pid = me or pid = any (list);
    continue when exists (select 1 from coverage_requests r where r.coverage_plan_case_id = cs.id and r.requested_profile_id = pid);
    excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = pid)
                 then private.cover_case_exclusions(cs.id, pid) else array['Not a colleague you can ask'] end;
    if array_length(excl, 1) is not null then
      raise exception '% can''t be asked about %: %. Nothing was sent.', private.member_name(pid), cs.case_reference, excl[1] using errcode = 'P0001';
    end if;
    list := list || pid;
  end loop;
  select count(*) into asked from coverage_requests where coverage_plan_case_id = cs.id;
  if asked + coalesce(array_length(list, 1), 0) > 20 then
    raise exception 'You can ask up to 20 colleagues about one client.' using errcode = 'P0001';
  end if;
  busy := exists (select 1 from coverage_requests r where r.coverage_plan_case_id = cs.id and r.status in ('sent', 'discussing', 'accepted'));
  if p_mode = 'parallel' then
    update coverage_plan_cases set outreach_mode = 'parallel', outreach_queue = '{}' where id = cs.id;
    foreach pid in array list loop
      perform private.cover_send_one(pl.id, cs.id, pid);
      sent := sent + 1;
    end loop;
  else
    if not busy and array_length(list, 1) is not null then
      update coverage_plan_cases set outreach_mode = 'sequential', outreach_queue = list[2:array_length(list, 1)] where id = cs.id;
      perform private.cover_send_one(pl.id, cs.id, list[1]);
      sent := 1;
    else
      update coverage_plan_cases set outreach_mode = 'sequential', outreach_queue = list where id = cs.id;
    end if;
  end if;
  if array_length(list, 1) is null then
    update coverage_plan_cases set status = 'needs_cover'
     where id = cs.id and not exists (select 1 from coverage_requests r where r.coverage_plan_case_id = cs.id and r.status in ('sent', 'discussing', 'accepted'));
  end if;
  return jsonb_build_object('unchanged', false, 'sent', sent, 'queued', coalesce(array_length(list, 1), 0) - sent);
end;
$$;

-- "Confirm cover arranged": every client has an agreed colleague and a ready handover. The plan stays active (and
-- visible) until the absence ends, then moves to history by itself.
create or replace function public.cover_mark_arranged(p_plan bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into pl from coverage_plans where id = p_plan and profile_id = me for update;
  if not found then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if pl.arranged_at is not null then
    return jsonb_build_object('unchanged', true);
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from coverage_plan_cases where coverage_plan_id = pl.id)
     or exists (select 1 from coverage_plan_cases c where c.coverage_plan_id = pl.id and (c.assigned_clinician_id is null or c.handover_confirmed_at is null)) then
    raise exception 'Every client needs an agreed colleague and a ready handover first.' using errcode = 'P0001';
  end if;
  update coverage_plans set arranged_at = now(), updated_at = now() where id = pl.id;
  perform private.cover_event(pl.id, null, null, 'arranged');
  return jsonb_build_object('unchanged', false);
end;
$$;

-- The old "Complete arrangement" now means the same as "Confirm cover arranged", so older screens still work.
create or replace function public.cover_complete_plan(p_plan bigint)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.cover_mark_arranged(p_plan); $$;

-- A plan whose absence has ended (the day after its last day, US Eastern) moves to history as "Absence completed".
-- This records the end of the absence; it doesn't claim every session happened. Open invitations close; the history,
-- agreements and anything still unresolved are kept.
create or replace function private.cover_auto_complete()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  n integer := 0;
begin
  for p in
    select id, profile_id from coverage_plans
     where status = 'active' and ends_on is not null and ends_on < (now() at time zone 'America/New_York')::date
     for update skip locked
  loop
    update coverage_requests r set status = 'expired', closed_reason = 'plan_ended', expires_at = null
      from coverage_plan_cases c
     where c.id = r.coverage_plan_case_id and c.coverage_plan_id = p.id and r.status in ('sent', 'discussing');
    update coverage_plan_cases set outreach_queue = '{}' where coverage_plan_id = p.id;
    update coverage_plans set status = 'completed', completed_at = now(), auto_completed = true, updated_at = now() where id = p.id;
    perform private.cover_event(p.id, null, null, 'absence_completed');
    perform private.notify_member('system_notice', p.profile_id, null, 'Your absence has ended, so this cover plan has moved to your history.',
                                  '/dashboard/cover?plan=' || p.id, 'cover_absence_completed:' || p.id,
                                  jsonb_build_object('coveragePlanId', p.id), false);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function private.cover_auto_complete() from public, anon, authenticated;

-- 3. Referrals ----------------------------------------------------------------------------------------------------

-- Sends one referral invitation now, with the referral's reply deadline if it has one.
create or replace function private.referral_send_one(p_referral bigint, p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r referral_requests%rowtype;
begin
  select * into r from referral_requests where id = p_referral;
  insert into referral_recipients (referral_request_id, profile_id, ord, sent_at, expires_at)
  values (p_referral, p_person, (select coalesce(max(ord), 0) + 1 from referral_recipients where referral_request_id = p_referral), now(),
          case when r.response_hours is not null then now() + make_interval(hours => r.response_hours) end)
  on conflict do nothing;
  if r.audience_type = 'selected' and not (p_person = any (r.audience_profile_ids)) then
    update referral_requests set audience_profile_ids = array_append(audience_profile_ids, p_person) where id = p_referral;
  end if;
  perform private.notify_member('referral_sent', p_person, r.requesting_profile_id, 'sent you a referral request',
                                '/dashboard/referrals?referral=' || p_referral, 'referral:' || p_referral || ':' || p_person,
                                jsonb_build_object('referralRequestId', p_referral));
end;
$$;
revoke all on function private.referral_send_one(bigint, uuid) from public, anon, authenticated;

-- One at a time: when nobody is still being asked (no reply yet, "I can accept", or a question), the next colleague in
-- the member's order is asked. Anyone who has since become ineligible is skipped.
create or replace function private.referral_advance(p_referral bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r referral_requests%rowtype;
  c record;
  nxt uuid;
  skipped uuid[] := '{}';
  excl text[];
begin
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.status::text not in ('open', 'sent', 'matched') or coalesce(array_length(r.outreach_queue, 1), 0) = 0 then
    return null;
  end if;
  if exists (select 1 from referral_responses where referral_request_id = r.id and status = 'accepted') then
    return null;
  end if;
  if exists (
    select 1 from referral_recipients rc
      left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
     where rc.referral_request_id = r.id and rc.closed_reason is null
       and (rs.id is null or rs.status::text in ('offered', 'interested', 'question'))
  ) then
    return null;
  end if;
  for c in select t.q as person, t.ord from unnest(r.outreach_queue) with ordinality as t(q, ord) order by t.ord loop
    if exists (select 1 from referral_recipients where referral_request_id = r.id and profile_id = c.person) then
      skipped := skipped || c.person;
      continue;
    end if;
    excl := case when exists (select 1 from private.visible_members(r.requesting_profile_id) vm where vm.id = c.person)
                 then private.referral_exclusions(r.id, c.person) else array['Not a colleague you can ask'] end;
    if array_length(excl, 1) is not null then
      skipped := skipped || c.person;
      continue;
    end if;
    nxt := c.person;
    exit;
  end loop;
  update referral_requests
     set outreach_queue = array(select t.q from unnest(r.outreach_queue) with ordinality as t(q, ord)
                                 where t.q is distinct from nxt and not (t.q = any (skipped)) order by t.ord)
   where id = r.id;
  if nxt is not null then
    perform private.referral_send_one(r.id, nxt);
  end if;
  return nxt;
end;
$$;
revoke all on function private.referral_advance(bigint) from public, anon, authenticated;

-- A reply pauses that colleague's deadline; "Not available" (or the sender declining them) moves the queue on.
create or replace function private.referral_after_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status::text in ('interested', 'question', 'offered', 'accepted') then
    update referral_recipients set expires_at = null
     where referral_request_id = new.referral_request_id and profile_id = new.responding_profile_id and closed_reason is null;
  elsif new.status::text in ('unavailable', 'declined', 'withdrawn') then
    update referral_recipients set expires_at = null
     where referral_request_id = new.referral_request_id and profile_id = new.responding_profile_id;
    perform private.referral_advance(new.referral_request_id);
  end if;
  return new;
end;
$$;
revoke all on function private.referral_after_response() from public, anon, authenticated;
drop trigger if exists referral_after_response on public.referral_responses;
create trigger referral_after_response after insert or update of status on public.referral_responses
  for each row execute function private.referral_after_response();

-- "Decline and continue search" for a referral.
create or replace function public.referral_decline(p_referral bigint, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  rc referral_recipients%rowtype;
  st text;
  nxt uuid;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id <> me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  select * into rc from referral_recipients where referral_request_id = p_referral and profile_id = p_person;
  if not found then
    raise exception 'That colleague wasn''t asked about this referral.' using errcode = 'P0001';
  end if;
  if rc.closed_reason = 'owner' then
    return jsonb_build_object('unchanged', true);
  end if;
  if r.status::text not in ('open', 'sent', 'matched') then
    raise exception 'This referral is closed.' using errcode = 'P0001';
  end if;
  select status::text into st from referral_responses where referral_request_id = p_referral and responding_profile_id = p_person;
  if st = 'accepted' then
    raise exception 'You''ve already agreed this referral with them.' using errcode = 'P0001';
  end if;
  update referral_recipients set closed_reason = 'owner', closed_at = now(), expires_at = null
   where referral_request_id = p_referral and profile_id = p_person;
  perform private.notify_member('referral_closed', p_person, me,
            'has made other arrangements for this referral. Thank you for your time.',
            '/dashboard/referrals?referral=' || p_referral, 'referral_declined:' || p_referral || ':' || p_person,
            jsonb_build_object('referralRequestId', p_referral));
  nxt := private.referral_advance(p_referral);
  return jsonb_build_object('unchanged', false, 'next', nxt, 'nextName', case when nxt is not null then private.member_name(nxt) end);
end;
$$;

-- "Add recipients" for a referral: the whole unsent list, in order, one at a time or everyone at once.
create or replace function public.referral_set_recipients(p_referral bigint, p_people uuid[], p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  pid uuid;
  excl text[];
  list uuid[] := '{}';
  asked integer;
  busy boolean;
  sent integer := 0;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if coalesce(p_mode, '') not in ('sequential', 'parallel') then
    raise exception 'Choose one at a time or everyone at once.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id <> me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status::text not in ('open', 'sent', 'matched') then
    raise exception 'This referral is closed.' using errcode = 'P0001';
  end if;
  foreach pid in array coalesce(p_people, '{}') loop
    continue when pid is null or pid = me or pid = any (list);
    continue when exists (select 1 from referral_recipients where referral_request_id = r.id and profile_id = pid);
    excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = pid)
                 then private.referral_exclusions(r.id, pid) else array['Not a colleague you can ask'] end;
    if array_length(excl, 1) is not null then
      raise exception '% can''t be asked about this referral: %. Nothing was sent.', private.member_name(pid), excl[1] using errcode = 'P0001';
    end if;
    list := list || pid;
  end loop;
  select count(*) into asked from referral_recipients where referral_request_id = r.id;
  if asked + coalesce(array_length(list, 1), 0) > 100 then
    raise exception 'Ask up to 100 colleagues about one referral.' using errcode = 'P0001';
  end if;
  busy := exists (
    select 1 from referral_recipients rc
      left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
     where rc.referral_request_id = r.id and rc.closed_reason is null
       and (rs.id is null or rs.status::text in ('offered', 'interested', 'question', 'accepted')));
  if r.response_hours is null then
    update referral_requests set response_hours = 48 where id = r.id;
  end if;
  if p_mode = 'parallel' then
    update referral_requests set outreach_mode = 'parallel', outreach_queue = '{}' where id = r.id;
    foreach pid in array list loop
      perform private.referral_send_one(r.id, pid);
      sent := sent + 1;
    end loop;
  else
    update referral_requests set outreach_mode = 'sequential', outreach_queue = list where id = r.id;
    if not busy and array_length(list, 1) is not null then
      perform private.referral_advance(r.id);
      sent := 1;
    end if;
  end if;
  return jsonb_build_object('unchanged', false, 'sent', sent, 'queued', coalesce(array_length(list, 1), 0) - sent);
end;
$$;

-- The old single "Ask another colleague" goes through the same rules (everyone at once, so it is sent now).
create or replace function public.referral_add(p_referral bigint, p_person uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.referral_set_recipients(p_referral, array[p_person], 'parallel'); $$;

-- Referral reply deadlines, the same organizer-chosen windows as Cover. A late reply can't place a client.
create or replace function private.referral_process_deadlines()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  x record;
  n integer := 0;
begin
  for x in
    select rc.referral_request_id as rid, rc.profile_id as pid, r.requesting_profile_id as owner
      from referral_recipients rc join referral_requests r on r.id = rc.referral_request_id
     where rc.expires_at is not null and rc.expires_at <= now() and rc.closed_reason is null
       and r.status::text in ('open', 'sent', 'matched')
       and not exists (select 1 from referral_responses rs where rs.referral_request_id = rc.referral_request_id
                        and rs.responding_profile_id = rc.profile_id and rs.status::text in ('interested', 'question', 'offered', 'accepted'))
     order by rc.expires_at
     for update of rc skip locked
  loop
    begin
      update referral_recipients set closed_reason = 'deadline', closed_at = now(), expires_at = null
       where referral_request_id = x.rid and profile_id = x.pid and closed_reason is null;
      perform private.notify_member('referral_response', x.owner, null, private.referral_label(x.rid) || ': a colleague did not reply before your deadline',
                                    '/dashboard/referrals?referral=' || x.rid, 'referral_deadline:' || x.rid || ':' || x.pid,
                                    jsonb_build_object('referralRequestId', x.rid, 'deadline', true), false);
      perform private.referral_advance(x.rid);
      n := n + 1;
    exception when others then
      raise warning 'referral_process_deadlines(%): %', x.rid, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;
revoke all on function private.referral_process_deadlines() from public, anon, authenticated;

-- 4. Existing functions, written out in full with the v3 changes ---------------------------------------------

-- Cover deadlines, auto-completion and referral deadlines in one job
CREATE OR REPLACE FUNCTION private.cover_process_deadlines()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  n integer := 0;
  owner uuid;
  lbl text;
begin
  for r in
    select cr.id, cr.requested_profile_id, cr.coverage_plan_case_id
      from coverage_requests cr
      join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
      join coverage_plans pl on pl.id = c.coverage_plan_id
     where cr.status = 'sent' and cr.expires_at is not null and cr.expires_at <= now()
       and pl.status = 'active'
       and not exists (select 1 from coverage_requests a where a.coverage_plan_case_id = cr.coverage_plan_case_id and a.status = 'accepted')
     order by cr.expires_at, cr.id
       for update of cr skip locked
  loop
    begin
      update coverage_requests set status = 'expired', closed_reason = 'deadline' where id = r.id and status = 'sent';
      if found then
        n := n + 1;
        select pl.profile_id, c.case_reference into owner, lbl
          from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id where c.id = r.coverage_plan_case_id;
        perform private.notify_member('coverage_response', owner, null, lbl || ': a colleague did not reply before your deadline',
                                      '/dashboard/cover?plan=' || (select coverage_plan_id from coverage_plan_cases where id = r.coverage_plan_case_id),
                                      'cover_deadline:' || r.id, jsonb_build_object('coverageRequestId', r.id, 'deadline', true), false);
      end if;
    exception when others then
      raise warning 'cover_process_deadlines(%): %', r.id, sqlerrm;
    end;
  end loop;
  n := n + private.cover_auto_complete();
  n := n + private.referral_process_deadlines();
  return n;
end;
$function$;

-- Plan history: the organizer declining a colleague
CREATE OR REPLACE FUNCTION private.cover_log_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan bigint;
  v_kind text;
begin
  select coverage_plan_id into v_plan from coverage_plan_cases where id = new.coverage_plan_case_id;
  if tg_op = 'INSERT' then
    -- The first request on a client is covered by the plan's own "invitations sent" line.
    if coalesce(current_setting('pa.cover_quiet', true), '') <> 'on' and (new.sequence_order > 1 or coalesce(current_setting('pa.cover_retry', true), '') = 'on') then
      perform private.cover_event(v_plan, new.coverage_plan_case_id, new.requested_profile_id, 'asked',
                                  jsonb_build_object('retry', coalesce(current_setting('pa.cover_retry', true), '') = 'on'));
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  v_kind := case new.status::text
    when 'declined' then case when new.closed_reason = 'owner' then 'declined_owner' else 'declined' end
    when 'discussing' then 'discussing'
    when 'accepted' then 'accepted'
    when 'expired' then case coalesce(new.closed_reason, '') when 'deadline' then 'expired' when 'competing' then 'closed_competing' else null end
    else null end;
  if v_kind is not null then
    perform private.cover_event(v_plan, new.coverage_plan_case_id, new.requested_profile_id, v_kind, '{}'::jsonb);
  end if;
  return new;
end;
$function$;

-- Plan history wording
CREATE OR REPLACE FUNCTION private.cover_event_text(p_kind text, p_owner_view boolean, p_label text, p_owner_first text, p_subject text, p_meta jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_owner_view then
    case p_kind
      when 'created' then 'Plan created with ' || private.count_word(coalesce((p_meta ->> 'clients')::integer, 0)) || ' anonymous client need' || case when coalesce((p_meta ->> 'clients')::integer, 0) = 1 then '' else 's' end || '.'
      when 'invited' then case when p_meta ->> 'mode' = 'parallel' then 'Parallel' else 'Sequential' end || ' invitations sent. Response deadline: ' || coalesce(p_meta ->> 'hours', '48') || ' hours.'
      when 'asked' then case when coalesce((p_meta ->> 'retry')::boolean, false) then p_label || ': a new request was sent to ' || p_subject || '.' else p_label || ': ' || p_subject || ' asked next.' end
      when 'declined' then p_label || ': ' || p_subject || ' is not available.'
      when 'declined_owner' then p_label || ': you declined ' || p_subject || ' and continued the search.'
      when 'arranged' then 'Cover arranged. Every client has an agreed colleague and a ready handover.'
      when 'absence_completed' then 'Absence completed. The plan moved to your history.'
      when 'discussing' then p_label || ': ' || p_subject || ' asked to discuss the arrangement. Automatic progression is paused.'
      when 'accepted' then p_label || ': cover agreed with ' || p_subject || '. Handover is still to be confirmed.'
      when 'expired' then p_label || ': ' || p_subject || ' did not reply before the deadline.'
      when 'skipped' then p_label || ': ' || p_subject || ' could not be asked because they are no longer an eligible match.'
      when 'handover_ready' then p_label || ': ' || p_owner_first || ' confirmed the handover with ' || p_subject || ' is ready.'
      when 'completed' then 'Arrangement completed. All handovers were confirmed.'
      when 'cancelled' then 'Plan cancelled. Outstanding invitations closed.'
      else null end
  else
    case p_kind
      when 'asked_you' then p_owner_first || ' asked you to help with ' || private.count_word(coalesce((p_meta ->> 'n')::integer, 1)) || ' client need' || case when coalesce((p_meta ->> 'n')::integer, 1) = 1 then '' else 's' end || '.'
      when 'asked' then p_owner_first || ' asked you about ' || p_label || '.'
      when 'declined' then 'You said you are not available for ' || p_label || '.'
      when 'declined_owner' then p_owner_first || ' made other arrangements for ' || p_label || '.'
      when 'arranged' then p_owner_first || ' confirmed the cover is arranged.'
      when 'absence_completed' then 'The absence has ended.'
      when 'discussing' then 'You asked to discuss ' || p_label || '.'
      when 'accepted' then 'Cover agreed with you for ' || p_label || '.'
      when 'expired' then 'The reply deadline for ' || p_label || ' passed.'
      when 'closed_competing' then p_label || ' is now covered by another colleague.'
      when 'handover_ready' then p_owner_first || ' confirmed the handover arrangements.'
      when 'completed' then 'Arrangement completed. All handovers were confirmed.'
      when 'cancelled' then 'Plan cancelled. Outstanding invitations closed.'
      else null end
  end;
$function$;

-- What a Cover plan carries to the screen
CREATE OR REPLACE FUNCTION private.cover_plan_json(p_plan bigint, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pl coverage_plans%rowtype;
  own boolean;
  c coverage_plan_cases%rowtype;
  clients jsonb := '[]'::jsonb;
  reqs jsonb;
  sel jsonb;
  st text;
  asg text;
  elsewhere boolean;
  states text[] := '{}';
  max_seq integer;
  mine coverage_requests%rowtype;
  cstate text;
begin
  select * into pl from coverage_plans where id = p_plan;
  own := pl.profile_id = p_viewer;
  for c in
    select * from coverage_plan_cases cc
     where cc.coverage_plan_id = p_plan
       and (own or exists (select 1 from coverage_requests r where r.coverage_plan_case_id = cc.id and r.requested_profile_id = p_viewer))
     order by cc.id
  loop
    cstate := upper(coalesce(c.jurisdiction_state, pl.jurisdiction_state, ''));
    if cstate <> '' and not (cstate = any (states)) then states := states || cstate; end if;
    elsewhere := not own and c.assigned_clinician_id is not null and c.assigned_clinician_id <> p_viewer;
    select coalesce(max(sequence_order), 0) into max_seq from coverage_requests where coverage_plan_case_id = c.id;
    select * into mine from coverage_requests where coverage_plan_case_id = c.id and requested_profile_id = p_viewer order by id desc limit 1;

    select coalesce(jsonb_agg(x.j order by x.ord, x.k), '[]'::jsonb) into reqs
      from (
        select r.sequence_order as ord, r.id as k,
               jsonb_build_object(
                 'id', r.id::text,
                 'person', case when r.requested_profile_id = p_viewer then 'me' else r.requested_profile_id::text end,
                 'status', case when r.interested_at is not null and r.status::text in ('sent', 'discussing') then 'interested' else case r.status::text when 'sent' then 'awaiting'
                                               when 'expired' then case when r.closed_reason = 'deadline' then 'expired' else 'closed' end
                                               else r.status::text end end,
                 'order', r.sequence_order, 'sentAt', r.sent_at, 'expiresAt', r.expires_at, 'respondedAt', r.responded_at,
                 'offeredAt', r.interested_at, 'closedBy', case when r.closed_reason = 'owner' then 'organizer' end) as j
          from coverage_requests r
         where r.coverage_plan_case_id = c.id and (own or r.requested_profile_id = p_viewer)
        union all
        select max_seq + t.ord::integer, 0::bigint,
               jsonb_build_object('id', 'q-' || c.id || '-' || t.q, 'person', t.q::text,
                                  'status', case when pl.status = 'active' and c.assigned_clinician_id is null then 'queued' else 'closed' end,
                                  'order', max_seq + t.ord::integer, 'sentAt', null, 'expiresAt', null, 'respondedAt', null)
          from unnest(coalesce(c.outreach_queue, '{}')) with ordinality as t(q, ord)
         where own
           and not exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.requested_profile_id = t.q)
      ) x;
    select coalesce(jsonb_agg(q.person order by q.o), '[]'::jsonb) into sel
      from (select e ->> 'person' as person, min(ord) as o from jsonb_array_elements(reqs) with ordinality as t(e, ord) group by e ->> 'person') q;

    st := case
      when c.assigned_clinician_id is not null and (own or not elsewhere) then case when c.handover_confirmed_at is not null then 'ready' else 'agreed' end
      when elsewhere then 'agreed'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.interested_at is not null and r.status in ('sent', 'discussing')) then 'interested'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'discussing') then 'discussing'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'sent') then 'awaiting'
      when not own and mine.interested_at is not null and mine.status in ('sent', 'discussing') then 'interested'
      when not own and mine.status = 'discussing' then 'discussing'
      when not own and mine.status = 'sent' then 'awaiting'
      else 'needs' end;
    asg := case when c.assigned_clinician_id is null or elsewhere then null
                when c.assigned_clinician_id = p_viewer then 'me' else c.assigned_clinician_id::text end;

    clients := clients || jsonb_build_object(
      'id', c.id,
      'label', c.case_reference,
      'focus', coalesce((select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[1]), ''),
      'secondary', case when c.via_hub then coalesce((select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[2]), '') else '' end,
      'state', cstate,
      'age', coalesce(c.age_band, ''),
      'setting', coalesce(c.modality, 'either'),
      'insurance', coalesce(c.insurance, ''),
      'frequency', coalesce(c.frequency, ''),
      'prescribing', coalesce(c.prescribing_needed, false),
      'language', coalesce(c.language, ''),
      'city', coalesce(c.city, ''),
      'selected', sel,
      'mode', coalesce(c.outreach_mode, pl.outreach_mode, 'sequential'),
      'requests', reqs,
      'status', st,
      'assignee', asg,
      'coveredElsewhere', elsewhere,
      'handover', jsonb_build_object('contact', c.handover_confirmed_at is not null and not elsewhere,
                                     'summary', c.handover_confirmed_at is not null and not elsewhere,
                                     'client', c.handover_confirmed_at is not null and not elsewhere));
  end loop;
  return jsonb_build_object(
    'id', pl.id,
    'name', pl.title,
    'owner', case when own then 'me' else pl.profile_id::text end,
    'reason', coalesce(pl.reason, case pl.absence_type when 'short_planned' then 'short' when 'extended_leave' then 'extended' when 'closing_practice' then 'closing' when 'unexpected' then 'unexpected' when 'reciprocal' then 'reciprocal' else 'other' end),
    'other', coalesce(pl.reason_note, ''),
    'start', coalesce(pl.starts_on, pl.created_at::date)::text,
    'end', coalesce(pl.ends_on, pl.starts_on, pl.created_at::date)::text,
    'states', to_jsonb(case when array_length(states, 1) is null and pl.jurisdiction_state is not null then array[upper(pl.jurisdiction_state)] else states end),
    'status', pl.status::text,
    'mode', coalesce(pl.outreach_mode, 'sequential'),
    'deadline', pl.response_hours,
    'message', coalesce(pl.notes, ''),
    'createdAt', pl.created_at,
    'arrangedAt', pl.arranged_at,
    'completedAt', pl.completed_at,
    'autoCompleted', pl.auto_completed,
    'history', private.cover_history(pl.id, p_viewer),
    'clients', clients);
end;
$function$;

-- Closing or reducing practice is temporary cover (R05)
CREATE OR REPLACE FUNCTION public.cover_create_plan(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  req_id uuid;
  plan_id bigint;
  nm text;
  reason text;
  mode text;
  hrs integer;
  d_start date;
  d_end date;
  msg text;
  clients jsonb;
  cl jsonb;
  ord integer;
  lbl text;
  st text;
  setting text;
  focus_name text;
  sec_name text;
  focus_id integer;
  sec_id integer;
  age_v text;
  ins_v text;
  lang_v text;
  v_city text;
  case_id bigint;
  pid uuid;
  sel uuid[];
  kept uuid[];
  excl text[];
  dropped jsonb := '[]'::jsonb;
  asked_per jsonb := '{}'::jsonb;
  first_req bigint;
  rid bigint;
  seq integer;
  states_seen text[] := '{}';
  n_asked integer := 0;
  k text;
  cnt integer;
  abs_type text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can ask colleagues for cover.' using errcode = 'P0001';
  end if;
  req_id := nullif(p_payload ->> 'requestId', '')::uuid;
  if req_id is not null then
    perform pg_advisory_xact_lock(hashtext('cover_create:' || me::text || req_id::text));
    select id into plan_id from coverage_plans where profile_id = me and client_request_id = req_id;
    if found then
      return jsonb_build_object('planId', plan_id, 'unchanged', true, 'dropped', '[]'::jsonb);
    end if;
  end if;

  nm := btrim(coalesce(p_payload ->> 'name', ''));
  if nm = '' or length(nm) > 80 then
    raise exception 'Give the plan a short name.' using errcode = 'P0001';
  end if;
  reason := coalesce(nullif(p_payload ->> 'reason', ''), 'short');
  if reason not in ('short', 'extended', 'unexpected', 'closing', 'reciprocal', 'other') then
    raise exception 'Choose the kind of cover you need.' using errcode = 'P0001';
  end if;
  mode := coalesce(nullif(p_payload ->> 'mode', ''), 'sequential');
  if mode not in ('sequential', 'parallel') then
    raise exception 'Choose how colleagues are asked.' using errcode = 'P0001';
  end if;
  hrs := coalesce(nullif(p_payload ->> 'deadline', '')::integer, 48);
  if hrs not in (6, 12, 24, 48, 72, 168) then
    raise exception 'Choose a response deadline from the list.' using errcode = 'P0001';
  end if;
  d_start := nullif(p_payload ->> 'start', '')::date;
  d_end := nullif(p_payload ->> 'end', '')::date;
  if d_start is null or d_end is null then
    raise exception 'Choose the first and last day.' using errcode = 'P0001';
  end if;
  if d_end < d_start then
    raise exception 'The last day is before the first day.' using errcode = 'P0001';
  end if;
  msg := btrim(coalesce(p_payload ->> 'message', ''));
  if length(msg) > 1000 then
    raise exception 'Keep the message under 1,000 characters.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_payload ->> 'other', '')) > 300 then
    raise exception 'Keep the note under 300 characters.' using errcode = 'P0001';
  end if;
  clients := coalesce(p_payload -> 'clients', '[]'::jsonb);
  if jsonb_typeof(clients) <> 'array' or jsonb_array_length(clients) = 0 then
    raise exception 'Add at least one client need.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(clients) > 20 then
    raise exception 'A plan can hold up to 20 client needs.' using errcode = 'P0001';
  end if;

  abs_type := case reason when 'short' then 'short_planned' when 'extended' then 'extended_leave' when 'closing' then 'closing_practice' else reason end;
  insert into coverage_plans (profile_id, plan_type, track, title, starts_on, ends_on, status, notes, absence_type, jurisdiction_state,
                              outreach_mode, reason, reason_note, response_hours, client_request_id)
  values (me,
          (case reason when 'reciprocal' then 'reciprocal' when 'extended' then 'extended_leave' else 'ad_hoc' end)::coverage_plan_type,
          null::coverage_plan_track,
          nm, d_start, d_end, 'active', nullif(msg, ''), abs_type,
          upper(nullif(clients -> 0 ->> 'state', '')), mode, reason, nullif(btrim(coalesce(p_payload ->> 'other', '')), ''), hrs, req_id)
  returning id into plan_id;

  perform set_config('pa.cover_quiet', 'on', true);
  ord := 0;
  for cl in select * from jsonb_array_elements(clients) loop
    ord := ord + 1;
    lbl := btrim(coalesce(cl ->> 'label', ''));
    if lbl = '' then lbl := 'Client ' || ord; end if;
    if length(lbl) > 40 then
      raise exception 'Keep each client label short.' using errcode = 'P0001';
    end if;
    st := upper(coalesce(cl ->> 'state', ''));
    if st !~ '^[A-Z]{2}$' then
      raise exception '% needs a state.', lbl using errcode = 'P0001';
    end if;
    setting := coalesce(nullif(cl ->> 'setting', ''), 'either');
    if setting not in ('virtual', 'in_person', 'either') then
      raise exception 'Choose a setting for %.', lbl using errcode = 'P0001';
    end if;
    focus_name := btrim(coalesce(cl ->> 'focus', ''));
    select id into focus_id from lookup_values where category = 'treatment_specialism' and value = focus_name;
    if focus_id is null then
      raise exception 'Choose a main treatment area for %.', lbl using errcode = 'P0001';
    end if;
    sec_name := btrim(coalesce(cl ->> 'secondary', ''));
    sec_id := null;
    if sec_name <> '' then
      select id into sec_id from lookup_values where category = 'treatment_specialism' and value = sec_name;
      if sec_id is null or sec_name = focus_name then
        raise exception 'Choose a different second treatment area for %.', lbl using errcode = 'P0001';
      end if;
    end if;
    age_v := nullif(btrim(coalesce(cl ->> 'age', '')), '');
    if age_v is not null and not exists (select 1 from lookup_values where category = 'age_group_specialism' and value = age_v) then
      raise exception 'Choose an age group from the list for %.', lbl using errcode = 'P0001';
    end if;
    ins_v := nullif(btrim(coalesce(cl ->> 'insurance', '')), '');
    if ins_v is not null and not exists (select 1 from lookup_values where category = 'insurance' and value = ins_v) then
      raise exception 'Choose insurance from the list for %.', lbl using errcode = 'P0001';
    end if;
    lang_v := nullif(btrim(coalesce(cl ->> 'language', '')), '');
    if lang_v is not null and not exists (select 1 from lookup_values where category = 'language' and value = lang_v) then
      raise exception 'Choose a language from the list for %.', lbl using errcode = 'P0001';
    end if;
    v_city := nullif(btrim(coalesce(cl ->> 'city', '')), '');
    if length(coalesce(v_city, '')) > 80 or length(coalesce(cl ->> 'frequency', '')) > 40 then
      raise exception 'Shorten the details for %.', lbl using errcode = 'P0001';
    end if;

    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency,
                                     prescribing_needed, jurisdiction_state, language, city, status, via_hub)
    values (plan_id, lbl, array_remove(array[focus_id, sec_id], null), age_v, setting, ins_v, nullif(btrim(coalesce(cl ->> 'frequency', '')), ''),
            coalesce((cl ->> 'prescribing')::boolean, false), st, lang_v, v_city, 'needs_cover', true)
    returning id into case_id;
    if not (st = any (states_seen)) then states_seen := states_seen || st; end if;

    -- Recipients: distinct, never the organiser, at most ten, in the order chosen.
    select coalesce(array_agg(x.id order by x.o), '{}') into sel
      from (select (e.value)::uuid as id, min(e.ordinality) as o
              from jsonb_array_elements_text(coalesce(cl -> 'selected', '[]'::jsonb)) with ordinality e(value, ordinality)
             where (e.value)::uuid <> me
             group by (e.value)::uuid) x;
    if array_length(sel, 1) > 10 then
      raise exception 'Ask up to ten colleagues about one client.' using errcode = 'P0001';
    end if;
    kept := '{}';
    foreach pid in array sel loop
      excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = pid)
                   then private.cover_case_exclusions(case_id, pid)
                   else array['Not a colleague you can ask'] end;
      if array_length(excl, 1) is null then
        kept := kept || pid;
      else
        dropped := dropped || jsonb_build_object('client', lbl, 'person', pid, 'reasons', to_jsonb(excl));
        if exists (select 1 from profiles where id = pid) then
          perform private.cover_event(plan_id, case_id, pid, 'skipped', jsonb_build_object('reasons', to_jsonb(excl)));
        end if;
      end if;
    end loop;

    if array_length(kept, 1) is not null then
      seq := 0;
      foreach pid in array kept loop
        seq := seq + 1;
        exit when mode = 'sequential' and seq > 1;
        insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, message)
        values (case_id, pid, seq, nullif(msg, ''))
        returning id into rid;
        n_asked := n_asked + 1;
        asked_per := jsonb_set(asked_per, array[pid::text], to_jsonb(coalesce((asked_per ->> pid::text)::integer, 0) + 1));
        if first_req is null then first_req := rid; end if;
        perform private.professional_event('coverage_request_sent', me, pid, 'sent a coverage request',
                                           jsonb_build_object('coveragePlanCaseId', case_id, 'coverageRequestId', rid));
      end loop;
      update coverage_plan_cases
         set status = 'awaiting_response',
             outreach_queue = case when mode = 'sequential' then kept[2:array_length(kept, 1)] else '{}'::uuid[] end
       where id = case_id;
    end if;
  end loop;
  perform set_config('pa.cover_quiet', 'off', true);

  update coverage_plans set jurisdiction_state = states_seen[1] where id = plan_id;
  perform private.cover_event(plan_id, null, null, 'created', jsonb_build_object('clients', jsonb_array_length(clients)));
  perform private.cover_event(plan_id, null, null, 'invited', jsonb_build_object('mode', mode, 'hours', hrs));
  for k, cnt in select key, value::integer from jsonb_each_text(asked_per) loop
    perform private.cover_event(plan_id, null, k::uuid, 'asked_you', jsonb_build_object('n', cnt));
    perform private.notify_member('coverage_request', k::uuid, me, 'sent you a coverage request',
                                  '/dashboard/cover?plan=' || plan_id, 'coverage_plan:' || plan_id || ':' || k,
                                  jsonb_build_object('coveragePlanId', plan_id));
  end loop;
  return jsonb_build_object('planId', plan_id, 'unchanged', false, 'dropped', dropped, 'asked', n_asked);
end;
$function$;

-- Referrals: one at a time or everyone at once, with a reply deadline
CREATE OR REPLACE FUNCTION public.referral_create(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  req_id uuid;
  ref_id bigint;
  st text;
  setting text;
  focus_name text;
  sec_name text;
  focus_id integer;
  sec_id integer;
  age_v text;
  ins_v text;
  lang_v text;
  lang_id integer;
  v_city text;
  aud text;
  tf text;
  msg text;
  ttl text;
  cand uuid[];
  kept uuid[] := '{}';
  pid uuid;
  excl text[];
  dropped jsonb := '[]'::jsonb;
  n integer := 0;
  v_mode text;
  v_hours integer;
  sendto uuid[];
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can make a referral.' using errcode = 'P0001';
  end if;
  req_id := nullif(p_payload ->> 'requestId', '')::uuid;
  if req_id is not null then
    perform pg_advisory_xact_lock(hashtext('referral_create:' || me::text || req_id::text));
    select id into ref_id from referral_requests where requesting_profile_id = me and client_request_id = req_id;
    if found then
      return jsonb_build_object('referralId', ref_id, 'unchanged', true, 'dropped', '[]'::jsonb);
    end if;
  end if;

  st := upper(coalesce(p_payload ->> 'state', ''));
  if st !~ '^[A-Z]{2}$' then
    raise exception 'Choose the client''s state.' using errcode = 'P0001';
  end if;
  setting := coalesce(nullif(p_payload ->> 'setting', ''), 'either');
  if setting not in ('virtual', 'in_person', 'either') then
    raise exception 'Choose a setting.' using errcode = 'P0001';
  end if;
  focus_name := btrim(coalesce(p_payload ->> 'focus', ''));
  select id into focus_id from lookup_values where category = 'treatment_specialism' and value = focus_name;
  if focus_id is null then
    raise exception 'Choose a main treatment area.' using errcode = 'P0001';
  end if;
  sec_name := btrim(coalesce(p_payload ->> 'secondary', ''));
  if sec_name <> '' then
    select id into sec_id from lookup_values where category = 'treatment_specialism' and value = sec_name;
    if sec_id is null or sec_name = focus_name then
      raise exception 'Choose a different second treatment area.' using errcode = 'P0001';
    end if;
  end if;
  age_v := nullif(btrim(coalesce(p_payload ->> 'age', '')), '');
  if age_v is not null and not exists (select 1 from lookup_values where category = 'age_group_specialism' and value = age_v) then
    raise exception 'Choose an age group from the list.' using errcode = 'P0001';
  end if;
  ins_v := nullif(btrim(coalesce(p_payload ->> 'insurance', '')), '');
  if ins_v is not null and not exists (select 1 from lookup_values where category = 'insurance' and value = ins_v) then
    raise exception 'Choose insurance from the list.' using errcode = 'P0001';
  end if;
  lang_v := nullif(btrim(coalesce(p_payload ->> 'language', '')), '');
  if lang_v is not null then
    select id into lang_id from lookup_values where category = 'language' and value = lang_v;
    if lang_id is null then
      raise exception 'Choose a language from the list.' using errcode = 'P0001';
    end if;
  end if;
  v_city := nullif(btrim(coalesce(p_payload ->> 'city', '')), '');
  if length(coalesce(v_city, '')) > 80 then
    raise exception 'Shorten the city.' using errcode = 'P0001';
  end if;
  aud := coalesce(nullif(p_payload ->> 'audience', ''), 'selected');
  if aud not in ('selected', 'trusted', 'network') then
    raise exception 'Choose who receives this referral.' using errcode = 'P0001';
  end if;
  tf := case lower(btrim(coalesce(p_payload ->> 'timeframe', '')))
          when 'as soon as possible' then 'urgent' when 'urgent' then 'urgent'
          when 'within two weeks' then 'within_two_weeks' when 'within_two_weeks' then 'within_two_weeks'
          when 'within a month' then 'within_month' when 'within_month' then 'within_month'
          when 'flexible' then 'flexible' else null end;
  if tf is null then
    raise exception 'Choose a timeframe.' using errcode = 'P0001';
  end if;
  ttl := btrim(coalesce(p_payload ->> 'title', ''));
  if ttl <> '' and private.referral_title_problem(ttl) is not null then
    raise exception '%', private.referral_title_problem(ttl) using errcode = 'P0001';
  end if;
  v_mode := case when p_payload ->> 'mode' = 'sequential' and aud in ('selected', 'trusted') then 'sequential' else 'parallel' end;
  v_hours := coalesce(nullif(p_payload ->> 'deadline', '')::integer, 48);
  if v_hours not in (6, 12, 24, 48, 72, 168) then
    raise exception 'Choose a response deadline from the list.' using errcode = 'P0001';
  end if;
  msg := btrim(coalesce(p_payload ->> 'message', ''));
  if length(msg) > 600 then
    raise exception 'Keep the note under 600 characters.' using errcode = 'P0001';
  end if;

  insert into referral_requests (requesting_profile_id, specialism_lookup_id, specialism_lookup_ids, state, insurance, notes, status, city,
                                 audience_type, audience_profile_ids, age_band, modality, language_lookup_id, timeframe, prescribing, client_request_id)
  values (me, focus_id, array_remove(array[focus_id, sec_id], null), st, ins_v, nullif(msg, ''), 'sent', v_city,
          case aud when 'network' then 'wider_network' else aud end, '{}', age_v, setting, lang_id, tf,
          coalesce((p_payload ->> 'prescribing')::boolean, false), req_id)
  returning id into ref_id;
  if ttl <> '' then
    insert into referral_titles (referral_request_id, profile_id, title) values (ref_id, me, ttl);
  end if;

  -- The people the audience names (never the referrer), in the order chosen.
  if aud = 'selected' then
    select coalesce(array_agg(x.id order by x.o), '{}') into cand
      from (select (e.value)::uuid as id, min(e.ordinality) as o
              from jsonb_array_elements_text(coalesce(p_payload -> 'selected', '[]'::jsonb)) with ordinality e(value, ordinality)
             where (e.value)::uuid <> me
             group by (e.value)::uuid) x;
    if array_length(cand, 1) > 100 then
      raise exception 'Ask up to 100 colleagues at once.' using errcode = 'P0001';
    end if;
  elsif aud = 'trusted' then
    -- In the order the member set on the review screen, then anyone else they trust.
    select coalesce(array_agg(t.colleague_id order by coalesce(o.ord, 100000), t.created_at, t.colleague_id), '{}') into cand
      from trusted_colleagues t
      left join (select (e.value)::uuid as id, min(e.ordinality) as ord
                   from jsonb_array_elements_text(case when jsonb_typeof(p_payload -> 'order') = 'array' then p_payload -> 'order' else '[]'::jsonb end) with ordinality e(value, ordinality)
                  group by (e.value)::uuid) o on o.id = t.colleague_id
     where t.profile_id = me and t.colleague_id <> me;
  else
    select coalesce(array_agg(vm.id order by private.member_name(vm.id), vm.id), '{}') into cand
      from private.visible_members(me) vm where vm.id <> me;
  end if;
  if array_length(cand, 1) > 5000 then
    raise exception 'That audience is too wide to notify at once. Choose selected colleagues or a narrower need.' using errcode = 'P0001';
  end if;

  -- Each one is checked against this client's needs now, not when they were shown.
  foreach pid in array cand loop
    excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = pid)
                 then private.referral_exclusions(ref_id, pid)
                 else array['Not a colleague you can ask'] end;
    if array_length(excl, 1) is null then
      kept := kept || pid;
    elsif aud = 'selected' then
      dropped := dropped || jsonb_build_object('person', pid, 'reasons', to_jsonb(excl));
    end if;
  end loop;
  if aud = 'selected' and array_length(kept, 1) is null then
    raise exception 'Select at least one eligible colleague, or choose a wider audience.' using errcode = 'P0001';
  end if;

  if array_length(kept, 1) is not null then
    -- One at a time asks the first colleague now and queues the rest in the member's order; everyone at once asks all.
    if v_mode = 'sequential' then
      sendto := kept[1:1];
      update referral_requests set outreach_mode = 'sequential', response_hours = v_hours,
             outreach_queue = coalesce(kept[2:array_length(kept, 1)], '{}') where id = ref_id;
    else
      sendto := kept;
      update referral_requests set outreach_mode = 'parallel', response_hours = v_hours where id = ref_id;
    end if;
    insert into referral_recipients (referral_request_id, profile_id, ord, sent_at, expires_at)
    select ref_id, k.id, k.o::integer, now(), now() + make_interval(hours => v_hours) from unnest(sendto) with ordinality as k(id, o)
    on conflict do nothing;
    if aud = 'selected' then
      update referral_requests set audience_profile_ids = sendto where id = ref_id;
    end if;
    foreach pid in array sendto loop
      n := n + 1;
      perform private.notify_member('referral_sent', pid, me, 'sent you a referral request',
                                    '/dashboard/referrals?referral=' || ref_id, 'referral:' || ref_id || ':' || pid,
                                    jsonb_build_object('referralRequestId', ref_id));
    end loop;
  end if;
  perform private.professional_event('referral_sent', me, null, 'sent a referral request',
                                     jsonb_build_object('referralRequestId', ref_id, 'audienceType', aud));
  return jsonb_build_object('referralId', ref_id, 'number', (select member_seq from referral_requests where id = ref_id), 'unchanged', false, 'dropped', dropped, 'asked', n, 'queued', coalesce(array_length(kept, 1), 0) - n);
end;
$function$;

-- Referral replies: closed invitations stay closed
CREATE OR REPLACE FUNCTION public.referral_answer(p_referral bigint, p_response text, p_capacity boolean DEFAULT false, p_question text DEFAULT NULL::text, p_client_message_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  rc referral_recipients%rowtype;
  rs referral_responses%rowtype;
  new_status text;
  q text := btrim(coalesce(p_question, ''));
  changed boolean := false;
  conv bigint;
  msg bigint;
  ckey text;
  secs integer;
  lic boolean;
  has_rs boolean;
  new_id bigint;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_response not in ('interested', 'declined', 'discussing') then
    raise exception 'Choose a response.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id = me or public.is_blocked_between(me, r.requesting_profile_id) then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  select * into rc from referral_recipients where referral_request_id = p_referral and profile_id = me;
  if not found then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  -- A closed invitation (deadline passed, or the sender went another way) can't be answered or turned into a placement.
  if rc.closed_reason is not null then
    raise exception 'This invitation has closed, so your reply wasn''t sent. You can still message the sender.' using errcode = 'P0001';
  end if;
  select * into rs from referral_responses where referral_request_id = p_referral and responding_profile_id = me;
  has_rs := found;
  if has_rs and rs.status::text = 'accepted' then
    raise exception 'You''ve already been chosen for this referral.' using errcode = 'P0001';
  end if;
  if r.status::text not in ('open', 'sent', 'matched') then
    raise exception 'This referral is no longer taking replies.' using errcode = 'P0001';
  end if;
  -- A lapsed licence can still say "not available"; nothing else.
  if not private.is_active_clinician(me) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  if p_response <> 'declined' and not private.is_network_member(me) then
    raise exception 'Your license isn''t current, so you can only decline this referral.' using errcode = 'P0001';
  end if;

  if p_response = 'interested' then
    if not coalesce(p_capacity, false) then
      raise exception 'Confirm your current capacity to express interest.' using errcode = 'P0001';
    end if;
    lic := private.licence_route(me, r.state,
             case when r.modality in ('virtual', 'telehealth') then 'virtual' when r.modality in ('in_person', 'in-person', 'face_to_face', 'f2f') then 'in_person' else 'either' end) is not null;
    if not lic then
      raise exception 'You need a reviewed license in % to take this referral.', r.state using errcode = 'P0001';
    end if;
  elsif p_response = 'discussing' then
    if q = '' then
      raise exception 'Write your question first.' using errcode = 'P0001';
    end if;
    if length(q) > 2000 then
      raise exception 'Keep the question under 2,000 characters.' using errcode = 'P0001';
    end if;
  end if;

  new_status := case p_response when 'interested' then 'interested' when 'declined' then 'unavailable' else 'question' end;
  if not has_rs then
    insert into referral_responses (referral_request_id, responding_profile_id, status, message, responded_at, capacity_confirmed_at)
    values (p_referral, me, new_status::referral_response_status, case when p_response = 'discussing' then q end, now(),
            case when p_response = 'interested' then now() end)
    on conflict (referral_request_id, responding_profile_id) do nothing
    returning id into new_id;
    changed := new_id is not null;
  elsif rs.status::text <> new_status then
    update referral_responses
       set status = new_status::referral_response_status, responded_at = now(),
           message = case when p_response = 'discussing' then q else message end,
           capacity_confirmed_at = case when p_response = 'interested' then now() else capacity_confirmed_at end
     where id = rs.id;
    changed := true;
  end if;

  if p_response = 'discussing' then
    ckey := 'referral-' || p_referral || '-' || me;
    conv := private.context_conversation(ckey, private.referral_label(p_referral) || ' · ' || coalesce((select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)), 'Client need'),
                                         array[r.requesting_profile_id, me], me,
                                         r.requesting_profile_id, private.referral_request_text(p_referral), rc.sent_at);
    msg := private.post_message(conv, me, q, p_client_message_id, '/dashboard/messages?thread=' || ckey);
  end if;

  if changed then
    secs := greatest(0, extract(epoch from now() - rc.sent_at)::integer);
    perform private.professional_event('referral_response', me, r.requesting_profile_id, 'responded "' || p_response || '" to a referral request',
                                       jsonb_build_object('referralRequestId', p_referral, 'response', p_response), secs);
    perform private.notify_member('referral_response', r.requesting_profile_id, me,
                                  case p_response when 'interested' then 'can accept your referral request'
                                                  when 'discussing' then 'asked a question about your referral request'
                                                  else 'is not available for your referral request' end,
                                  '/dashboard/referrals?referral=' || p_referral, 'referral_response:' || p_referral || ':' || me || ':' || p_response,
                                  jsonb_build_object('referralRequestId', p_referral, 'response', p_response));
  end if;
  return jsonb_build_object('status', p_response, 'unchanged', not changed, 'conversationKey', ckey, 'messageId', msg);
end;
$function$;

-- Cover replies: notification wording matches the screens
CREATE OR REPLACE FUNCTION public.cover_answer(p_request bigint, p_response text, p_question text DEFAULT NULL::text, p_client_message_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
  changed boolean := false;
  q text := btrim(coalesce(p_question, ''));
  conv bigint;
  msg bigint;
  ckey text;
  excl text[];
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_response not in ('accepted', 'interested', 'declined', 'discussing') then
    raise exception 'Choose a response.' using errcode = 'P0001';
  end if;
  select * into rq from coverage_requests where id = p_request;
  if not found or rq.requested_profile_id <> me then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  -- One answer at a time per client: two colleagues answering together queue here.
  select * into cs from coverage_plan_cases where id = rq.coverage_plan_case_id for update;
  select * into pl from coverage_plans where id = cs.coverage_plan_id;
  select * into rq from coverage_requests where id = p_request;
  if public.is_blocked_between(me, pl.profile_id) then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  -- A lapsed licence can still say "not available"; nothing else. A closed or
  -- suspended account can do nothing.
  if not private.is_active_clinician(me) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  if p_response <> 'declined' and not private.is_network_member(me) then
    raise exception 'Your license isn''t current, so you can only decline this request.' using errcode = 'P0001';
  end if;
  -- Interest, not agreement (Nick, 1 Nov): the member who asked confirms one colleague per client.
  if p_response in ('accepted', 'interested') then
    if pl.status::text <> 'active' or rq.status::text not in ('sent', 'discussing') then
      raise exception 'This request is closed. The colleague may have found cover elsewhere.' using errcode = 'P0001';
    end if;
    if cs.assigned_clinician_id is not null then
      raise exception 'Another colleague has already taken on this client, so it''s covered. Thank you for offering.' using errcode = 'P0001';
    end if;
    excl := private.cover_case_exclusions(cs.id, me);
    if excl[1] like 'No reviewed %' then
      raise exception 'Your license for % isn''t current, so you can''t take on this client.', coalesce(cs.jurisdiction_state, pl.jurisdiction_state) using errcode = 'P0001';
    end if;
    if rq.interested_at is null then
      update coverage_requests set interested_at = now(), expires_at = null, responded_at = coalesce(responded_at, now()) where id = p_request;
      perform private.professional_event('coverage_response', me, pl.profile_id, 'responded "interested" to a coverage request',
                                         jsonb_build_object('coverageRequestId', p_request, 'response', 'interested'));
      perform private.notify_member('coverage_response', pl.profile_id, me, 'can cover your client',
                                    '/dashboard/cover?plan=' || pl.id, 'coverage_response:' || p_request || ':interested',
                                    jsonb_build_object('coverageRequestId', p_request, 'response', 'interested'));
    end if;
    return jsonb_build_object('status', 'interested', 'unchanged', rq.interested_at is not null);
  end if;
  if p_response = 'discussing' then
    if q = '' then
      raise exception 'Write your question first.' using errcode = 'P0001';
    end if;
    if length(q) > 2000 then
      raise exception 'Keep the question under 2,000 characters.' using errcode = 'P0001';
    end if;
  end if;

  if rq.status::text <> p_response then
    if p_response = 'accepted' then
      excl := private.cover_case_exclusions(cs.id, me);
      if excl[1] like 'No reviewed %' then
        raise exception 'Your license for % isn''t current, so you can''t take on this client.', coalesce(cs.jurisdiction_state, pl.jurisdiction_state) using errcode = 'P0001';
      end if;
    end if;
    update coverage_requests set status = p_response::coverage_request_status, responded_at = now() where id = p_request;
    changed := true;
  end if;

  if p_response = 'discussing' then
    ckey := 'cover-' || pl.id || '-' || cs.id || '-' || me;
    conv := private.context_conversation(ckey, pl.title || ' · ' || cs.case_reference, array[pl.profile_id, me], me,
                                         pl.profile_id, private.cover_request_text(pl.id, cs.id), rq.sent_at);
    msg := private.post_message(conv, me, q, p_client_message_id, '/dashboard/messages?thread=' || ckey);
  end if;

  if changed then
    perform private.professional_event('coverage_response', me, pl.profile_id, 'responded "' || p_response || '" to a coverage request',
                                       jsonb_build_object('coverageRequestId', p_request, 'response', p_response),
                                       greatest(0, extract(epoch from now() - rq.sent_at)::integer));
    if p_response = 'accepted' then
      perform private.professional_event('coverage_confirmed', me, pl.profile_id, null,
                                         jsonb_build_object('coverageRequestId', p_request, 'coveragePlanCaseId', cs.id));
    end if;
    perform private.notify_member(case when p_response = 'accepted' then 'coverage_confirmed' else 'coverage_response' end,
                                  pl.profile_id, me,
                                  case p_response when 'accepted' then 'agreed to cover your client'
                                                  when 'discussing' then 'asked a question about your coverage request'
                                                  else 'is not available for your cover request' end,
                                  '/dashboard/cover?plan=' || pl.id, 'coverage_response:' || p_request || ':' || p_response,
                                  jsonb_build_object('coverageRequestId', p_request, 'response', p_response));
  end if;
  return jsonb_build_object('status', p_response, 'unchanged', not changed, 'conversationKey', ckey, 'messageId', msg);
end;
$function$;

-- Referrals: agree after a discussion
CREATE OR REPLACE FUNCTION public.choose_referral_colleague(p_referral bigint, p_colleague uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  v_reply text;
  v_other uuid;
begin
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id is distinct from me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account isn''t active in the network right now, so you can''t choose a colleague.' using errcode = 'P0001';
  end if;
  if r.status = 'closed' then
    raise exception 'This referral is closed.' using errcode = 'P0001';
  end if;
  if r.audience_type = 'selected' and not (p_colleague = any (r.audience_profile_ids)) then
    raise exception 'You can only choose a colleague you sent this referral to.' using errcode = 'P0001';
  end if;
  select status into v_reply from referral_responses where referral_request_id = p_referral and responding_profile_id = p_colleague;
  -- An offer ("I can accept this referral"), a discussion, or an agreement reached in conversation can be recorded
  -- (Nick, 4 Nov). A colleague who said Not available, or whose invitation was closed, can't be.
  if v_reply in ('unavailable', 'declined', 'withdrawn')
     or exists (select 1 from referral_recipients where referral_request_id = p_referral and profile_id = p_colleague and closed_reason = 'owner') then
    raise exception 'That colleague isn''t part of this referral any more. Please choose another colleague.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(p_colleague) then
    raise exception 'That colleague can''t take referrals right now. Please choose another colleague who replied.' using errcode = 'P0001';
  end if;
  select responding_profile_id into v_other from referral_responses
  where referral_request_id = p_referral and status = 'accepted' and responding_profile_id <> p_colleague
  limit 1;
  if v_other is not null then
    raise exception 'You''ve already chosen % for this referral.', private.display_name(v_other) using errcode = 'P0001';
  end if;
  if v_reply = 'accepted' then
    return jsonb_build_object('already', true);
  end if;
  if v_reply is null then
    insert into referral_responses (referral_request_id, responding_profile_id, status, responded_at)
    values (p_referral, p_colleague, 'accepted', now());
  else
    update referral_responses set status = 'accepted', responded_at = now()
    where referral_request_id = p_referral and responding_profile_id = p_colleague;
  end if;
  update referral_requests set outreach_queue = '{}' where id = p_referral;
  update referral_recipients set expires_at = null where referral_request_id = p_referral;
  update referral_requests set status = 'connected' where id = p_referral;
  return jsonb_build_object('already', false);
end;
$function$;

-- Withdrawing a referral stops its queue
CREATE OR REPLACE FUNCTION public.referral_withdraw(p_referral bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  o record;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id <> me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status::text = 'closed' and r.withdrawn_at is not null then
    return jsonb_build_object('unchanged', true);
  end if;
  if r.status::text <> 'open' and r.status::text <> 'sent' and r.status::text <> 'matched' then
    raise exception 'This referral has already been placed.' using errcode = 'P0001';
  end if;
  update referral_requests set status = 'closed', closed_at = now(), withdrawn_at = now(), outreach_queue = '{}' where id = p_referral;
  update referral_recipients set expires_at = null where referral_request_id = p_referral;
  for o in
    select rc.profile_id from referral_recipients rc
      left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
     where rc.referral_request_id = p_referral and coalesce(rs.status::text, 'offered') not in ('unavailable', 'withdrawn')
  loop
    perform private.notify_member('system_notice', o.profile_id, me, 'withdrew a referral request they had sent you',
                                  '/dashboard/referrals?referral=' || p_referral, 'referral_withdrawn:' || p_referral || ':' || o.profile_id,
                                  jsonb_build_object('referralRequestId', p_referral), false);
  end loop;
  return jsonb_build_object('unchanged', false);
end;
$function$;

-- What a referral carries to the screen
CREATE OR REPLACE FUNCTION private.referral_json(p_referral bigint, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r referral_requests%rowtype;
  own boolean;
  st text;
  chosen uuid;
  reqs jsonb;
begin
  select * into r from referral_requests where id = p_referral;
  own := r.requesting_profile_id = p_viewer;
  select responding_profile_id into chosen from referral_responses where referral_request_id = r.id and status = 'accepted' limit 1;
  st := case when r.status::text in ('connected', 'handoff') then 'placed'
             when r.status::text = 'closed' then case when chosen is not null then 'placed' else 'withdrawn' end
             else 'discussion' end;
  select coalesce(jsonb_agg(x.j order by x.ord, x.sent, x.k), '[]'::jsonb) into reqs
    from (
      select rc.ord, rc.sent_at as sent, rc.profile_id as k,
             jsonb_build_object(
               'id', r.id || '-' || rc.profile_id,
               'person', case when rc.profile_id = p_viewer then 'me' else rc.profile_id::text end,
               'status', case when rc.closed_reason = 'owner' and b.base <> 'placed' then 'declined'
                              when rc.closed_reason = 'deadline' and b.base = 'awaiting' then 'expired'
                              when b.base in ('awaiting', 'interested', 'discussing') and st <> 'discussion' then 'closed' else b.base end,
               'closedBy', case when rc.closed_reason = 'owner' then 'organizer' end, 'expiresAt', rc.expires_at,
               'order', rc.ord, 'sentAt', rc.sent_at, 'respondedAt', rs.responded_at, 'capacityConfirmedAt', rs.capacity_confirmed_at,
               'beforeWithdrawal', case when st = 'withdrawn' and b.base in ('awaiting', 'interested', 'discussing') then b.base end) as j
        from referral_recipients rc
        left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
        cross join lateral (select case rs.status::text when 'accepted' then 'placed' when 'interested' then 'interested' when 'offered' then 'interested'
                                                       when 'question' then 'discussing' when 'unavailable' then 'declined' when 'withdrawn' then 'declined'
                                                       else 'awaiting' end as base) b
       where rc.referral_request_id = r.id and (own or rc.profile_id = p_viewer)
      union all
      select 100000 + t.ord::integer, null::timestamptz, t.q,
             jsonb_build_object('id', r.id || '-q-' || t.q, 'person', t.q::text, 'status', case when st = 'discussion' then 'queued' else 'closed' end,
                                'order', 100000 + t.ord::integer, 'sentAt', null, 'respondedAt', null, 'capacityConfirmedAt', null)
        from unnest(coalesce(r.outreach_queue, '{}')) with ordinality as t(q, ord)
       where own and not exists (select 1 from referral_recipients x2 where x2.referral_request_id = r.id and x2.profile_id = t.q)
    ) x;
  return jsonb_build_object(
    'id', r.id,
    'number', coalesce(r.member_seq, r.id),
    'label', 'Referral ' || coalesce(r.member_seq, r.id),
    'title', case when own then (select t.title from referral_titles t where t.referral_request_id = r.id) end,
    'owner', case when own then 'me' else r.requesting_profile_id::text end,
    'focus', coalesce((select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)), ''),
    'secondary', coalesce((select lv.value from lookup_values lv where lv.id = r.specialism_lookup_ids[2]), ''),
    'state', upper(coalesce(r.state, '')),
    'city', coalesce(r.city, ''),
    'age', coalesce(r.age_band, ''),
    'setting', case when r.modality in ('virtual', 'telehealth') then 'virtual' when r.modality in ('in_person', 'in-person', 'face_to_face', 'f2f') then 'in_person' else 'either' end,
    'insurance', coalesce(r.insurance, ''),
    'language', coalesce((select lv.value from lookup_values lv where lv.id = r.language_lookup_id), ''),
    'prescribing', r.prescribing,
    'status', st,
    'audience', case r.audience_type when 'wider_network' then 'network' when 'suggested' then 'selected' else r.audience_type end,
    'timeframe', case r.timeframe when 'urgent' then 'As soon as possible' when 'within_two_weeks' then 'Within two weeks'
                                  when 'within_month' then 'Within a month' else 'Flexible' end,
    'message', coalesce(r.notes, ''),
    'requests', reqs,
    'mode', r.outreach_mode,
    'deadline', r.response_hours,
    'placedWith', case when chosen is null then null when own then chosen::text when chosen = p_viewer then 'me' else null end,
    'placedElsewhere', (not own and st = 'placed' and chosen is distinct from p_viewer),
    'createdAt', r.created_at,
    'withdrawnAt', case when st = 'withdrawn' then coalesce(r.withdrawn_at, r.closed_at) end);
end;
$function$;

-- 5. Consultation groups: who has been invited and not joined yet (Nick, 4 Nov) -------------------------------------
-- Organisers see everyone they invited, including people invited by email who have not joined PsyAlliance yet.
create or replace function public.workspace_groups()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'name', g.name,
           'purpose', coalesce(g.purpose, ''),
           'cadence', coalesce(g.cadence, ''),
           'minutes', g.meeting_length_minutes,
           'format', g.meeting_format,
           'charter', coalesce(g.charter_body, ''),
           'founder', case when g.created_by = auth.uid() then 'me' else g.created_by::text end,
           'organiser', private.group_is_organiser(g.id, auth.uid()),
           'link', coalesce(g.meeting_link, ''),
           'next', g.next_meeting_at,
           'count', (select count(*) from consultation_group_members m where m.group_id = g.id and m.status = 'joined'),
           'members', coalesce((select jsonb_agg(m.profile_id order by m.invited_at, m.id)
                                  from consultation_group_members m
                                 where m.group_id = g.id and m.status = 'joined' and m.profile_id <> auth.uid()
                                   and m.profile_id in (select v.id from private.visible_members(auth.uid()) v)), '[]'::jsonb),
           'pending', case when private.group_is_organiser(g.id, auth.uid()) then coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'person', case when m.profile_id is not null and m.profile_id in (select v.id from private.visible_members(auth.uid()) v) then m.profile_id::text end,
                                 'email', case when m.profile_id is null then m.external_email end,
                                 'invitedAt', m.invited_at) order by m.invited_at, m.id)
                          from consultation_group_members m
                         where m.group_id = g.id and m.status = 'invited'), '[]'::jsonb) else '[]'::jsonb end
         ) order by g.created_at, g.id), '[]'::jsonb)
    from consultation_groups g
   where auth.uid() is not null
     and exists (select 1 from consultation_group_members m where m.group_id = g.id and m.profile_id = auth.uid() and m.status = 'joined');
$$;

-- Network: when you last worked with each colleague
CREATE OR REPLACE FUNCTION public.workspace_tiers()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with vm as (select id from private.visible_members(auth.uid())),
  excl as (select d.blocked_profile_id as colleague_id from do_not_work_with d where d.profile_id = auth.uid() and d.block_type = 'exclude'),
  trusted as (select t.colleague_id from trusted_colleagues t where t.profile_id = auth.uid() and t.colleague_id in (select id from vm)),
  worked as (select w.colleague_id, w.reason, w.at from private.workspace_worked(auth.uid()) w where w.colleague_id in (select id from vm) and w.colleague_id not in (select colleague_id from trusted)),
  liked as (
    select h.colleague_id, max(h.at) as at from (
      select m.author_id as colleague_id, r.created_at as at
        from message_reactions r join conversation_messages m on m.id = r.message_id
       where r.profile_id = auth.uid() and r.reaction = 'heart' and m.author_id <> auth.uid() and m.deleted_at is null
      union all
      select x.responder_profile_id, u.created_at
        from consultation_response_useful u join consultation_responses x on x.id = u.response_id
       where u.profile_id = auth.uid() and x.responder_profile_id <> auth.uid()
    ) h group by h.colleague_id
  ),
  suggested as (
    select s.colleague_id, 0 as grp, s.position::numeric as ord from suggested_colleagues s
     where s.profile_id = auth.uid() and s.colleague_id in (select id from vm) and s.colleague_id not in (select colleague_id from excl)
       and s.colleague_id not in (select colleague_id from trusted) and s.colleague_id not in (select colleague_id from worked)
    union all
    select l.colleague_id, 1, -extract(epoch from l.at)
      from liked l
     where l.colleague_id in (select id from vm) and l.colleague_id not in (select colleague_id from excl)
       and l.colleague_id not in (select colleague_id from trusted) and l.colleague_id not in (select colleague_id from worked)
       and l.colleague_id not in (select s2.colleague_id from suggested_colleagues s2 where s2.profile_id = auth.uid())
  )
  select jsonb_build_object(
    'trust', coalesce((select jsonb_agg(colleague_id order by created_at) from (select t2.colleague_id, t2.created_at from trusted_colleagues t2 where t2.profile_id = auth.uid() and t2.colleague_id in (select id from vm)) q), '[]'::jsonb),
    'worked', coalesce((select jsonb_agg(colleague_id order by at desc) from worked), '[]'::jsonb),
    'suggested', coalesce((select jsonb_agg(colleague_id order by grp, ord) from suggested), '[]'::jsonb),
    'excluded', coalesce((select jsonb_agg(colleague_id) from excl where colleague_id in (select id from vm)), '[]'::jsonb),
    'trustSince', coalesce((select jsonb_object_agg(t3.colleague_id, t3.created_at) from trusted_colleagues t3 where t3.profile_id = auth.uid() and t3.colleague_id in (select id from vm)), '{}'::jsonb),
    'trustedBy', coalesce((select jsonb_agg(t4.profile_id) from trusted_colleagues t4 where t4.colleague_id = auth.uid() and t4.profile_id in (select id from vm)), '[]'::jsonb),
    'collab', coalesce((select jsonb_object_agg(w2.colleague_id, w2.interaction_count) from worked_with_before w2 where w2.profile_id = auth.uid() and w2.colleague_id in (select id from vm) and w2.interaction_count > 0), '{}'::jsonb),
    'workedReasons', coalesce((select jsonb_object_agg(colleague_id, reason) from worked), '{}'::jsonb),
    -- When this member last worked with each colleague, for the Worked with before recency filter (Nick, 4 Nov).
    'workedAt', coalesce((select jsonb_object_agg(colleague_id, at) from worked), '{}'::jsonb),
    -- Colleagues who invited this member (D-12): the screens say so on their Suggested card.
    'invitedBy', coalesce((select jsonb_agg(u.inviter) from member_invite_uses u where u.invitee = auth.uid() and u.connected_at is not null and u.inviter in (select id from vm)), '[]'::jsonb)
  )
  where auth.uid() is not null;
$function$;

-- 6. Who can call what ----------------------------------------------------------------------------------------------
revoke all on function public.cover_decline(bigint) from public, anon;
grant execute on function public.cover_decline(bigint) to authenticated;
revoke all on function public.cover_set_recipients(bigint, bigint, uuid[], text) from public, anon;
grant execute on function public.cover_set_recipients(bigint, bigint, uuid[], text) to authenticated;
revoke all on function public.cover_mark_arranged(bigint) from public, anon;
grant execute on function public.cover_mark_arranged(bigint) to authenticated;
revoke all on function public.referral_decline(bigint, uuid) from public, anon;
grant execute on function public.referral_decline(bigint, uuid) to authenticated;
revoke all on function public.referral_set_recipients(bigint, uuid[], text) from public, anon;
grant execute on function public.referral_set_recipients(bigint, uuid[], text) to authenticated;
