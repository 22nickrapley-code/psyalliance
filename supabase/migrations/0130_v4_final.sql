-- PsyAlliance v4: the final build before the pilot (Nick's decisions of 6 November). Safe to run more than once.
--
-- What this file does, in order:
--   1. AI switch: one "AI tech enabled" setting per site, off to start, changed from the admin portal without a
--      rebuild. A limit of 20 AI uses a day per member. Nothing here calls a model; the site does that, and only
--      after asking this database whether AI is on and taking one use from the member's daily allowance.
--   2. Agreeing after a discussion: the colleague confirms with one tap before it counts (A1). A reminder after
--      24 hours; after 48 hours it comes back to the member who asked, and nothing moves on by itself.
--   3. Closing or reducing practice is temporary cover, with "until further notice" allowed (A8, R05).
--   4. Continuity "Still correct" (B2), Close for finished referrals (B7), membership activation (X-02, $30 a month,
--      founding places free), change details on a sent plan or referral (X-01).
--   5. Who can call the new functions.
-- Every function is written out in full, so the result is the same on every project.

-- 1. AI switch ----------------------------------------------------------------------------------------------------

insert into public.app_config (key, value) values ('ai_enabled', 'false') on conflict (key) do nothing;

create table if not exists public.ai_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  uses integer not null default 0,
  smart integer not null default 0,
  ask integer not null default 0,
  primary key (profile_id, day)
);
alter table public.ai_usage enable row level security;
-- No policies: members read their allowance through ai_status(); admins see totals through admin_ai_overview().

-- The daily allowance, in one place.
create or replace function private.ai_daily_limit()
returns integer language sql immutable as $$ select 20 $$;

create or replace function private.ai_is_on()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_config where key = 'ai_enabled'), 'false') = 'true';
$$;

-- What the signed-in member's screens need: is AI on here, and how many uses are left today (US Eastern days).
create or replace function public.ai_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  used integer := 0;
begin
  if me is null then
    return jsonb_build_object('enabled', false, 'left', 0, 'limit', private.ai_daily_limit());
  end if;
  select uses into used from ai_usage where profile_id = me and day = (now() at time zone 'America/New_York')::date;
  return jsonb_build_object('enabled', private.ai_is_on(), 'left', greatest(private.ai_daily_limit() - coalesce(used, 0), 0),
                            'limit', private.ai_daily_limit());
end;
$$;

-- Takes one use before the site calls the model. Refuses when AI is off here, when the account isn't active, or when
-- today's allowance is used up. p_kind is 'smart' (filling in a form) or 'ask' (Ask PsyAlliance).
create or replace function public.ai_take(p_kind text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  used integer;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.ai_is_on() then
    raise exception 'AI features are switched off at the moment. The form works as usual.' using errcode = 'P0001';
  end if;
  if p_kind not in ('smart', 'ask') then
    raise exception 'Unknown AI use.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = me and coalesce(account_status, 'active') = 'active') then
    raise exception 'Your account isn''t active, so AI features aren''t available.' using errcode = 'P0001';
  end if;
  insert into ai_usage (profile_id, day, uses, smart, ask)
  values (me, today, 0, 0, 0)
  on conflict (profile_id, day) do nothing;
  select uses into used from ai_usage where profile_id = me and day = today for update;
  if used >= private.ai_daily_limit() then
    raise exception 'You''ve used today''s % AI requests. They reset tomorrow; the form works as usual.', private.ai_daily_limit()
      using errcode = 'P0001';
  end if;
  update ai_usage set uses = uses + 1,
                      smart = smart + case when p_kind = 'smart' then 1 else 0 end,
                      ask = ask + case when p_kind = 'ask' then 1 else 0 end
   where profile_id = me and day = today;
  return private.ai_daily_limit() - used - 1;
end;
$$;

-- The admin switch. One per site: the sandbox and the live site each have their own.
create or replace function public.admin_set_ai(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  insert into app_config (key, value, updated_at) values ('ai_enabled', case when p_on then 'true' else 'false' end, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value, updated_at) values ('ai_enabled_by', coalesce(private.member_name(auth.uid()), 'An admin'), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.admin_ai_overview();
end;
$$;

create or replace function public.admin_ai_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'enabled', private.ai_is_on(),
    'changedAt', (select updated_at from app_config where key = 'ai_enabled'),
    'changedBy', (select value from app_config where key = 'ai_enabled_by'),
    'limit', private.ai_daily_limit(),
    'today', jsonb_build_object('uses', coalesce((select sum(uses) from ai_usage where day = today), 0),
                                'smart', coalesce((select sum(smart) from ai_usage where day = today), 0),
                                'ask', coalesce((select sum(ask) from ai_usage where day = today), 0),
                                'members', (select count(*) from ai_usage where day = today and uses > 0),
                                'atLimit', (select count(*) from ai_usage where day = today and uses >= private.ai_daily_limit())),
    'week', jsonb_build_object('uses', coalesce((select sum(uses) from ai_usage where day > today - 7), 0),
                               'smart', coalesce((select sum(smart) from ai_usage where day > today - 7), 0),
                               'ask', coalesce((select sum(ask) from ai_usage where day > today - 7), 0),
                               'members', (select count(distinct profile_id) from ai_usage where day > today - 7 and uses > 0)));
end;
$$;

-- 2. Agreeing after a discussion: the colleague confirms (A1) ---------------------------------------------------------

alter table public.coverage_requests
  add column if not exists owner_agreed_at timestamptz,
  add column if not exists confirm_reminded_at timestamptz,
  add column if not exists confirm_lapsed_at timestamptz;
alter table public.referral_responses
  add column if not exists owner_agreed_at timestamptz,
  add column if not exists confirm_reminded_at timestamptz,
  add column if not exists confirm_lapsed_at timestamptz;

-- Everything that must be true before a colleague can be agreed for a client, checked in the same transaction as the
-- change (R03). p_owner is the member who asked for cover.
create or replace function private.cover_agree_check(p_request bigint, p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
  excl text[];
  who text;
begin
  select * into rq from coverage_requests where id = p_request;
  select * into cs from coverage_plan_cases where id = rq.coverage_plan_case_id;
  select * into pl from coverage_plans where id = cs.coverage_plan_id;
  who := private.member_name(rq.requested_profile_id);
  if pl.status <> 'active' then
    raise exception 'This plan has ended, so nobody can be chosen now.' using errcode = 'P0001';
  end if;
  if rq.status::text not in ('sent', 'discussing') then
    raise exception 'The invitation to % has closed, so they can''t be chosen now. Use Add recipients to ask them again.', who using errcode = 'P0001';
  end if;
  if cs.assigned_clinician_id is not null then
    raise exception 'This client already has a colleague covering.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(p_owner) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can agree cover.' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(p_owner, rq.requested_profile_id) then
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
end;
$$;

-- The agreement itself: the client is assigned, the other open invitations for this client close, and both sides are
-- told. Runs only when both sides have said yes.
create or replace function private.cover_accept(p_request bigint, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
  others uuid[];
begin
  select * into rq from coverage_requests where id = p_request;
  select * into cs from coverage_plan_cases where id = rq.coverage_plan_case_id for update;
  select * into pl from coverage_plans where id = cs.coverage_plan_id;
  select * into rq from coverage_requests where id = p_request;
  if rq.status::text = 'accepted' then
    return jsonb_build_object('unchanged', true);
  end if;
  perform private.cover_agree_check(p_request, p_owner);
  select coalesce(array_agg(r.requested_profile_id), '{}') into others
    from coverage_requests r where r.coverage_plan_case_id = cs.id and r.id <> p_request and r.status::text in ('sent', 'discussing');
  update coverage_requests set status = 'accepted', responded_at = coalesce(responded_at, now()), expires_at = null,
                               confirm_lapsed_at = null
   where id = p_request;
  update coverage_plan_cases set outreach_queue = '{}' where id = cs.id;
  perform private.notify_member('coverage_closed', o, p_owner,
            'found cover for this client with another colleague. Thank you for offering.',
            '/dashboard/cover?plan=' || pl.id, 'coverage_closed:' || cs.id || ':' || o,
            jsonb_build_object('coveragePlanCaseId', cs.id))
     from unnest(others) o;
  perform private.professional_event('coverage_confirmed', rq.requested_profile_id, p_owner, null,
                                     jsonb_build_object('coverageRequestId', p_request, 'coveragePlanCaseId', cs.id));
  perform private.notify_member('coverage_confirmed', rq.requested_profile_id, p_owner, 'agreed cover with you for their client',
                                '/dashboard/cover?plan=' || pl.id, 'coverage_confirmed:' || p_request,
                                jsonb_build_object('coverageRequestId', p_request));
  return jsonb_build_object('unchanged', false);
end;
$$;

-- "Cover agreed", pressed by the member who asked. If the colleague already said "I can cover", that is both sides and
-- the client is assigned now. After a discussion alone, the colleague is asked to confirm with one tap; until they do,
-- nothing else changes (Nick, 6 Nov). Pressing it again after the 48 hours have passed asks them again.
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
  if rq.interested_at is not null then
    return private.cover_accept(p_request, me);
  end if;
  perform private.cover_agree_check(p_request, me);
  if rq.owner_agreed_at is not null and rq.confirm_lapsed_at is null then
    return jsonb_build_object('unchanged', true, 'pending', true);
  end if;
  update coverage_requests
     set owner_agreed_at = now(), confirm_reminded_at = null, confirm_lapsed_at = null, expires_at = null,
         status = 'discussing'
   where id = p_request;
  perform private.notify_member('coverage_request', rq.requested_profile_id, me,
            'recorded that you agreed to cover ' || cs.case_reference || '. Please confirm or tell them it isn''t right.',
            '/dashboard/cover?plan=' || pl.id, 'cover_agree:' || p_request || ':' || extract(epoch from now())::bigint,
            jsonb_build_object('coverageRequestId', p_request));
  return jsonb_build_object('unchanged', false, 'pending', true);
end;
$$;

-- The colleague's answer to "recorded that you agreed": Confirm (the agreement counts now) or "That's not right" (the
-- discussion stays open and the member who asked decides what next).
create or replace function public.cover_agreement_reply(p_request bigint, p_confirm boolean)
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
begin
  select * into rq from coverage_requests where id = p_request;
  if not found or rq.requested_profile_id is distinct from me then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  select * into cs from coverage_plan_cases where id = rq.coverage_plan_case_id;
  select * into pl from coverage_plans where id = cs.coverage_plan_id;
  if rq.status::text = 'accepted' then
    return jsonb_build_object('unchanged', true);
  end if;
  if rq.owner_agreed_at is null then
    raise exception 'There''s nothing to confirm on this request any more.' using errcode = 'P0001';
  end if;
  if p_confirm then
    update coverage_requests set interested_at = coalesce(interested_at, now()) where id = p_request;
    perform private.cover_accept(p_request, pl.profile_id);
    perform private.notify_member('coverage_response', pl.profile_id, me, 'confirmed cover for ' || cs.case_reference || '.',
              '/dashboard/cover?plan=' || pl.id, 'cover_agree_yes:' || p_request, jsonb_build_object('coverageRequestId', p_request));
    return jsonb_build_object('unchanged', false, 'confirmed', true);
  end if;
  update coverage_requests set owner_agreed_at = null, confirm_reminded_at = null, confirm_lapsed_at = null where id = p_request;
  perform private.notify_member('coverage_response', pl.profile_id, me,
            'said the agreement for ' || cs.case_reference || ' isn''t right. The conversation stays open.',
            '/dashboard/cover?plan=' || pl.id, 'cover_agree_no:' || p_request || ':' || extract(epoch from now())::bigint,
            jsonb_build_object('coverageRequestId', p_request));
  return jsonb_build_object('unchanged', false, 'confirmed', false);
end;
$$;

-- "Referral agreed", pressed by the member who referred. The same rule as Cover: a colleague who said "I can accept"
-- is placed now; after a discussion alone, they confirm first.
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
  v_agreed timestamptz;
  v_lapsed timestamptz;
  v_other uuid;
begin
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id is distinct from me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  perform private.referral_agree_check(p_referral, p_colleague);
  select status::text, owner_agreed_at, confirm_lapsed_at into v_reply, v_agreed, v_lapsed
    from referral_responses where referral_request_id = p_referral and responding_profile_id = p_colleague;
  if v_reply = 'accepted' then
    return jsonb_build_object('already', true);
  end if;
  if v_reply in ('interested', 'offered') then
    return private.referral_place(p_referral, p_colleague);
  end if;
  if v_agreed is not null and v_lapsed is null then
    return jsonb_build_object('already', true, 'pending', true);
  end if;
  if v_reply is null then
    insert into referral_responses (referral_request_id, responding_profile_id, status, responded_at, owner_agreed_at)
    values (p_referral, p_colleague, 'question', now(), now());
  else
    update referral_responses set owner_agreed_at = now(), confirm_reminded_at = null, confirm_lapsed_at = null
     where referral_request_id = p_referral and responding_profile_id = p_colleague;
  end if;
  update referral_recipients set expires_at = null where referral_request_id = p_referral and profile_id = p_colleague;
  perform private.notify_member('referral_sent', p_colleague, me,
            'recorded that you agreed to take Referral ' || coalesce(r.member_seq, r.id) || '. Please confirm or tell them it isn''t right.',
            '/dashboard/referrals?referral=' || r.id, 'ref_agree:' || r.id || ':' || p_colleague || ':' || extract(epoch from now())::bigint,
            jsonb_build_object('referralRequestId', r.id));
  return jsonb_build_object('already', false, 'pending', true);
end;
$function$;

create or replace function private.referral_agree_check(p_referral bigint, p_colleague uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r referral_requests%rowtype;
  v_reply text;
  v_other uuid;
begin
  select * into r from referral_requests where id = p_referral;
  if not private.is_network_member(r.requesting_profile_id) then
    raise exception 'Your account isn''t active in the network right now, so you can''t choose a colleague.' using errcode = 'P0001';
  end if;
  if r.status = 'closed' then
    raise exception 'This referral is no longer open.' using errcode = 'P0001';
  end if;
  if r.audience_type = 'selected' and not (p_colleague = any (r.audience_profile_ids)) then
    raise exception 'You can only choose a colleague you sent this referral to.' using errcode = 'P0001';
  end if;
  select status into v_reply from referral_responses where referral_request_id = p_referral and responding_profile_id = p_colleague;
  if v_reply in ('unavailable', 'declined', 'withdrawn')
     or exists (select 1 from referral_recipients where referral_request_id = p_referral and profile_id = p_colleague and closed_reason = 'owner') then
    raise exception 'That colleague isn''t part of this referral any more. Please choose another colleague.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(p_colleague) then
    raise exception 'That colleague can''t take referrals right now. Please choose another colleague who replied.' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(r.requesting_profile_id, p_colleague) then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  select responding_profile_id into v_other from referral_responses
   where referral_request_id = p_referral and status = 'accepted' and responding_profile_id <> p_colleague limit 1;
  if v_other is not null then
    raise exception 'You''ve already chosen % for this referral.', private.display_name(v_other) using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.referral_place(p_referral bigint, p_colleague uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.referral_agree_check(p_referral, p_colleague);
  if exists (select 1 from referral_responses where referral_request_id = p_referral and responding_profile_id = p_colleague) then
    update referral_responses set status = 'accepted', responded_at = now(), confirm_lapsed_at = null
     where referral_request_id = p_referral and responding_profile_id = p_colleague;
  else
    insert into referral_responses (referral_request_id, responding_profile_id, status, responded_at)
    values (p_referral, p_colleague, 'accepted', now());
  end if;
  update referral_requests set outreach_queue = '{}' where id = p_referral;
  update referral_recipients set expires_at = null where referral_request_id = p_referral;
  update referral_requests set status = 'connected' where id = p_referral;
  return jsonb_build_object('already', false);
end;
$$;

create or replace function public.referral_agreement_reply(p_referral bigint, p_confirm boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  rs referral_responses%rowtype;
begin
  select * into r from referral_requests where id = p_referral for update;
  select * into rs from referral_responses where referral_request_id = p_referral and responding_profile_id = me;
  if r.id is null or rs.referral_request_id is null then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if rs.status::text = 'accepted' then
    return jsonb_build_object('unchanged', true);
  end if;
  if rs.owner_agreed_at is null then
    raise exception 'There''s nothing to confirm on this referral any more.' using errcode = 'P0001';
  end if;
  if p_confirm then
    update referral_responses set capacity_confirmed_at = coalesce(capacity_confirmed_at, now())
     where referral_request_id = p_referral and responding_profile_id = me;
    if exists (select 1 from unnest(private.referral_exclusions(p_referral, me)) x where x like 'No reviewed %') then
      raise exception 'Your license for % isn''t current, so this referral can''t be placed with you. Please update Credentials.', r.state using errcode = 'P0001';
    end if;
    perform set_config('pa.agreement_confirm', 'on', true);
    perform private.referral_place(p_referral, me);
    perform set_config('pa.agreement_confirm', 'off', true);
    perform private.referral_placed_effects(p_referral, r.requesting_profile_id, me);
    perform private.notify_member('referral_response', r.requesting_profile_id, me, 'confirmed Referral ' || coalesce(r.member_seq, r.id) || '.',
              '/dashboard/referrals?referral=' || r.id, 'ref_agree_yes:' || r.id || ':' || me, jsonb_build_object('referralRequestId', r.id));
    return jsonb_build_object('unchanged', false, 'confirmed', true);
  end if;
  update referral_responses set owner_agreed_at = null, confirm_reminded_at = null, confirm_lapsed_at = null
   where referral_request_id = p_referral and responding_profile_id = me;
  perform private.notify_member('referral_response', r.requesting_profile_id, me,
            'said the agreement for Referral ' || coalesce(r.member_seq, r.id) || ' isn''t right. The conversation stays open.',
            '/dashboard/referrals?referral=' || r.id, 'ref_agree_no:' || r.id || ':' || me || ':' || extract(epoch from now())::bigint,
            jsonb_build_object('referralRequestId', r.id));
  return jsonb_build_object('unchanged', false, 'confirmed', false);
end;
$$;

-- Reminders and the 48-hour point, every minute. Nothing moves on by itself: after 48 hours the member who asked
-- is told and chooses Ask again or Decline and continue search.
create or replace function private.agreement_deadlines()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x record;
begin
  -- In the sandbox, the fictional colleagues confirm within a minute or two, so a guest sees the whole journey.
  for x in
    select r.id, pl.profile_id owner
      from coverage_requests r join coverage_plan_cases cs on cs.id = r.coverage_plan_case_id join coverage_plans pl on pl.id = cs.coverage_plan_id
     where r.owner_agreed_at is not null and r.status::text in ('sent', 'discussing') and r.owner_agreed_at < now() - interval '50 seconds'
       and private.is_sandbox_colleague(r.requested_profile_id)
  loop
    begin
      update coverage_requests set interested_at = coalesce(interested_at, now()) where id = x.id;
      perform private.cover_accept(x.id, x.owner);
    exception when others then
      update coverage_requests set confirm_lapsed_at = now() where id = x.id;
    end;
  end loop;
  for x in
    select rs.referral_request_id rid, rs.responding_profile_id who, r.requesting_profile_id owner
      from referral_responses rs join referral_requests r on r.id = rs.referral_request_id
     where rs.owner_agreed_at is not null and rs.status::text <> 'accepted' and r.status::text not in ('closed', 'connected', 'handoff')
       and rs.owner_agreed_at < now() - interval '50 seconds' and private.is_sandbox_colleague(rs.responding_profile_id)
  loop
    begin
      perform set_config('pa.agreement_confirm', 'on', true);
      perform private.referral_place(x.rid, x.who);
      perform set_config('pa.agreement_confirm', 'off', true);
      perform private.referral_placed_effects(x.rid, x.owner, x.who);
    exception when others then
      update referral_responses set confirm_lapsed_at = now() where referral_request_id = x.rid and responding_profile_id = x.who;
    end;
  end loop;
  for x in
    select r.id, r.requested_profile_id who, pl.profile_id owner, pl.id plan, cs.case_reference ref
      from coverage_requests r join coverage_plan_cases cs on cs.id = r.coverage_plan_case_id join coverage_plans pl on pl.id = cs.coverage_plan_id
     where r.owner_agreed_at is not null and r.status::text in ('sent', 'discussing') and r.confirm_lapsed_at is null
       and r.confirm_reminded_at is null and r.owner_agreed_at < now() - interval '24 hours'
  loop
    update coverage_requests set confirm_reminded_at = now() where id = x.id;
    perform private.notify_member('coverage_request', x.who, x.owner,
              'is waiting for you to confirm cover for ' || x.ref || '.',
              '/dashboard/cover?plan=' || x.plan, 'cover_agree_remind:' || x.id, jsonb_build_object('coverageRequestId', x.id));
  end loop;
  for x in
    select r.id, r.requested_profile_id who, pl.profile_id owner, pl.id plan, cs.case_reference ref
      from coverage_requests r join coverage_plan_cases cs on cs.id = r.coverage_plan_case_id join coverage_plans pl on pl.id = cs.coverage_plan_id
     where r.owner_agreed_at is not null and r.status::text in ('sent', 'discussing') and r.confirm_lapsed_at is null
       and r.owner_agreed_at < now() - interval '48 hours'
  loop
    update coverage_requests set confirm_lapsed_at = now() where id = x.id;
    perform private.notify_member('coverage_response', x.owner, x.who,
              'hasn''t confirmed cover for ' || x.ref || ' after 48 hours. Ask again, or decline and continue your search.',
              '/dashboard/cover?plan=' || x.plan, 'cover_agree_lapse:' || x.id, jsonb_build_object('coverageRequestId', x.id));
  end loop;
  for x in
    select rs.referral_request_id rid, rs.responding_profile_id who, r.requesting_profile_id owner, coalesce(r.member_seq, r.id) num
      from referral_responses rs join referral_requests r on r.id = rs.referral_request_id
     where rs.owner_agreed_at is not null and rs.status::text <> 'accepted' and r.status::text not in ('closed', 'connected', 'handoff')
       and rs.confirm_lapsed_at is null and rs.confirm_reminded_at is null and rs.owner_agreed_at < now() - interval '24 hours'
  loop
    update referral_responses set confirm_reminded_at = now() where referral_request_id = x.rid and responding_profile_id = x.who;
    perform private.notify_member('referral_sent', x.who, x.owner,
              'is waiting for you to confirm Referral ' || x.num || '.',
              '/dashboard/referrals?referral=' || x.rid, 'ref_agree_remind:' || x.rid || ':' || x.who, jsonb_build_object('referralRequestId', x.rid));
  end loop;
  for x in
    select rs.referral_request_id rid, rs.responding_profile_id who, r.requesting_profile_id owner, coalesce(r.member_seq, r.id) num
      from referral_responses rs join referral_requests r on r.id = rs.referral_request_id
     where rs.owner_agreed_at is not null and rs.status::text <> 'accepted' and r.status::text not in ('closed', 'connected', 'handoff')
       and rs.confirm_lapsed_at is null and rs.owner_agreed_at < now() - interval '48 hours'
  loop
    update referral_responses set confirm_lapsed_at = now() where referral_request_id = x.rid and responding_profile_id = x.who;
    perform private.notify_member('referral_response', x.owner, x.who,
              'hasn''t confirmed Referral ' || x.num || ' after 48 hours. Ask again, or decline and continue your search.',
              '/dashboard/referrals?referral=' || x.rid, 'ref_agree_lapse:' || x.rid || ':' || x.who, jsonb_build_object('referralRequestId', x.rid));
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'pa_agreement_deadlines') then
      perform cron.unschedule('pa_agreement_deadlines');
    end if;
    perform cron.schedule('pa_agreement_deadlines', '* * * * *', 'select private.agreement_deadlines()');
  end if;
end $$;

-- What follows a placement: the relationship and outcome events, the chosen colleague told, the others thanked.
create or replace function private.referral_placed_effects(p_referral bigint, p_owner uuid, p_colleague uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.professional_event('professional_relationship_created', p_owner, p_colleague, 'established a professional connection via referral',
                                     jsonb_build_object('referralRequestId', p_referral));
  perform private.professional_event('referral_outcome', p_owner, p_colleague, 'placed a referral with a colleague',
                                     jsonb_build_object('referralRequestId', p_referral));
  perform private.notify_member('referral_connected', p_colleague, p_owner, 'chose you for a referral',
                                '/dashboard/referrals?referral=' || p_referral, 'referral_connected:' || p_referral || ':' || p_colleague,
                                jsonb_build_object('referralRequestId', p_referral));
  perform private.notify_member('referral_closed', rr.profile_id, p_owner,
            'chose another colleague for this referral, based on fit. Thank you for responding; they may contact you directly.',
            '/dashboard/referrals?referral=' || p_referral, 'referral_closed:' || p_referral || ':' || rr.profile_id,
            jsonb_build_object('referralRequestId', p_referral))
     from referral_recipients rr
    where rr.referral_request_id = p_referral and rr.profile_id <> p_colleague;
end;
$$;

-- "Referral agreed" from the screens. A colleague who already said "I can accept" is placed now; after a discussion
-- alone the colleague confirms first, and the placement (with its events and notices) happens when they do.
CREATE OR REPLACE FUNCTION public.referral_place(p_referral bigint, p_colleague uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  res jsonb;
  excl text[];
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id <> me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status::text in ('connected', 'handoff') and exists (select 1 from referral_responses where referral_request_id = p_referral and responding_profile_id = p_colleague and status = 'accepted') then
    return jsonb_build_object('unchanged', true);
  end if;
  if r.status::text = 'closed' then
    raise exception 'This referral is no longer open.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from referral_recipients where referral_request_id = p_referral and profile_id = p_colleague) then
    raise exception 'You can only choose a colleague you sent this referral to.' using errcode = 'P0001';
  end if;
  excl := private.referral_exclusions(p_referral, p_colleague);
  if excl[1] like 'No reviewed %' then
    raise exception 'That colleague''s license for % isn''t current, so they can''t take this referral. Please choose another colleague who replied.', r.state using errcode = 'P0001';
  end if;
  res := public.choose_referral_colleague(p_referral, p_colleague);
  if coalesce((res ->> 'pending')::boolean, false) then
    return jsonb_build_object('unchanged', coalesce((res ->> 'already')::boolean, false), 'pending', true);
  end if;
  if coalesce((res ->> 'already')::boolean, false) then
    return jsonb_build_object('unchanged', true);
  end if;
  perform private.referral_placed_effects(p_referral, me, p_colleague);
  return jsonb_build_object('unchanged', false);
end;
$function$;

-- Replies: a colleague can't choose themselves, except by confirming an agreement the referring member recorded.
create or replace function public.guard_referral_response_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if auth.uid() is null or current_setting('pa.seeding', true) = 'on' then
    return new;
  end if;
  select id, requesting_profile_id, status into r from referral_requests where id = old.referral_request_id;
  if r.id is not null and auth.uid() = r.requesting_profile_id then
    return new;
  end if;
  if auth.uid() = old.responding_profile_id then
    if new.responding_profile_id <> old.responding_profile_id or new.referral_request_id <> old.referral_request_id then
      raise exception 'That reply can''t be moved.' using errcode = 'P0001';
    end if;
    if old.status = 'accepted' then
      raise exception 'You''ve already been chosen for this referral.' using errcode = 'P0001';
    end if;
    -- The colleague confirming an agreement the referring member recorded (v4, Nick 6 Nov) is the one exception.
    if new.status = 'accepted' and not (old.owner_agreed_at is not null and current_setting('pa.agreement_confirm', true) = 'on') then
      raise exception 'Only the referring colleague can choose who takes a referral.' using errcode = 'P0001';
    end if;
    if r.id is null or r.status not in ('open', 'sent') then
      raise exception 'This referral is no longer taking replies.' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status and new.status::text in ('interested', 'question', 'offered')
       and not private.is_network_member(auth.uid()) then
      raise exception 'Your account isn''t active in the network right now, so you can''t offer on referrals.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- What the screens read: agreements waiting for the colleague, open-ended cover, referrals closed by their owner
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
                 'status', case when r.owner_agreed_at is not null and r.status::text in ('sent', 'discussing') then 'confirming'
                                when r.interested_at is not null and r.status::text in ('sent', 'discussing') then 'interested' else case r.status::text when 'sent' then 'awaiting'
                                               when 'expired' then case when r.closed_reason = 'deadline' then 'expired' else 'closed' end
                                               else r.status::text end end,
                 'order', r.sequence_order, 'sentAt', r.sent_at, 'expiresAt', r.expires_at, 'respondedAt', r.responded_at,
                 'offeredAt', r.interested_at, 'closedBy', case when r.closed_reason = 'owner' then 'organizer' end,
                 'agreedAt', r.owner_agreed_at, 'confirmLapsed', r.confirm_lapsed_at is not null) as j
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
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.owner_agreed_at is not null and r.status in ('sent', 'discussing')) then 'confirming'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.interested_at is not null and r.status in ('sent', 'discussing')) then 'interested'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'discussing') then 'discussing'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'sent') then 'awaiting'
      when not own and mine.owner_agreed_at is not null and mine.status in ('sent', 'discussing') then 'confirming'
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
    'openEnded', pl.ends_on is null,
    'detailsChangedAt', pl.details_changed_at,
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
               'status', case when rs.owner_agreed_at is not null and b.base in ('awaiting', 'interested', 'discussing') and st = 'discussion' then 'confirming'
                              when rc.closed_reason = 'owner' and b.base <> 'placed' then 'declined'
                              when rc.closed_reason = 'deadline' and b.base = 'awaiting' then 'expired'
                              when b.base in ('awaiting', 'interested', 'discussing') and st <> 'discussion' then 'closed' else b.base end,
               'closedBy', case when rc.closed_reason = 'owner' then 'organizer' end, 'expiresAt', rc.expires_at,
               'order', rc.ord, 'sentAt', rc.sent_at, 'respondedAt', rs.responded_at, 'capacityConfirmedAt', rs.capacity_confirmed_at,
               'agreedAt', rs.owner_agreed_at, 'confirmLapsed', rs.confirm_lapsed_at is not null,
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
    'closedByOwnerAt', case when own then r.owner_closed_at end,
    'detailsChangedAt', r.details_changed_at,
    'withdrawnAt', case when st = 'withdrawn' then coalesce(r.withdrawn_at, r.closed_at) end);
end;
$function$;


-- 3. Closing or reducing practice is temporary cover, with "until further notice" allowed (A8, R05) ---------------------
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
  -- Closing or reducing practice, and reciprocal cover, can run "until further notice" (Nick, 6 Nov): no last day.
  -- It is still temporary cover; the member ends it with "End this cover" when it stops.
  if d_start is null or (d_end is null and reason not in ('closing', 'reciprocal')) then
    raise exception 'Choose the first and last day.' using errcode = 'P0001';
  end if;
  if d_end is not null and d_end < d_start then
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

-- An open-ended plan reads "from Mar 2, until further notice" in invitations.
CREATE OR REPLACE FUNCTION private.cover_request_text(p_plan bigint, p_case bigint)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif(btrim(pl.notes), ''),
         c.case_reference || ': '
         || concat_ws(' + ',
              (select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[1]),
              case when c.via_hub then (select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[2]) end)
         || '. ' || case when pl.ends_on is null
                         then 'From ' || to_char(coalesce(pl.starts_on, pl.created_at::date), 'Mon FMDD') || ', until further notice'
                         else to_char(coalesce(pl.starts_on, pl.created_at::date), 'Mon FMDD') || ' – '
                              || to_char(pl.ends_on, 'Mon FMDD') end
         || '. Shall we discuss the cover arrangements?')
    from coverage_plans pl join coverage_plan_cases c on c.coverage_plan_id = pl.id
   where pl.id = p_plan and c.id = p_case;
$function$;

-- "End this cover" for an open-ended plan: today becomes the last day, and the plan moves to history tomorrow like any
-- other plan.
create or replace function public.cover_end_plan(p_plan bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  today date := (now() at time zone 'America/New_York')::date;
begin
  select * into pl from coverage_plans where id = p_plan for update;
  if not found or pl.profile_id is distinct from me then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if pl.status <> 'active' then
    return jsonb_build_object('unchanged', true);
  end if;
  update coverage_plans set ends_on = greatest(today, coalesce(starts_on, today)), updated_at = now() where id = p_plan;
  perform private.notify_member('coverage_response', a, me, 'set the last day of their cover to ' || to_char(greatest(today, coalesce(pl.starts_on, today)), 'Mon FMDD') || '.',
            '/dashboard/cover?plan=' || p_plan, 'cover_end:' || p_plan || ':' || a, jsonb_build_object('coveragePlanId', p_plan))
     from (select distinct assigned_clinician_id a from coverage_plan_cases where coverage_plan_id = p_plan and assigned_clinician_id is not null) x;
  return jsonb_build_object('unchanged', false);
end;
$$;

-- 4. Continuity "Still correct", Close, membership, change details -------------------------------------------------

-- "Still correct": the yearly review, without having to change anything (B2).
create or replace function public.continuity_still_correct()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  update continuity_plans set reviewed_at = now() where profile_id = me;
  if not found then
    raise exception 'Start your continuity plan first.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('reviewedAt', now());
end;
$$;

-- "Close": a placed or withdrawn referral moves to Completed (B7).
alter table public.referral_requests add column if not exists owner_closed_at timestamptz;
alter table public.referral_requests add column if not exists details_changed_at timestamptz;
alter table public.coverage_plans add column if not exists details_changed_at timestamptz;

create or replace function public.referral_close(p_referral bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
begin
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id is distinct from me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status::text not in ('connected', 'handoff', 'closed') then
    raise exception 'This referral is still open. Agree a colleague or withdraw it first.' using errcode = 'P0001';
  end if;
  update referral_requests set owner_closed_at = coalesce(owner_closed_at, now()) where id = p_referral;
  return jsonb_build_object('closedAt', now());
end;
$$;

-- Membership (X-02, decisions of 5 and 6 Nov). Nobody is charged: "Activate membership" records the member's choice
-- and their main practice state. The first 40 members to activate in each state are founding members, free for life;
-- after that membership is $30 a month, shown but not taken until payments are set up. Founding places start again
-- from zero: the places given automatically before now are kept in founding_places_before_v4 and cleared, and from
-- now on a place is given when a member activates. Members who were approved before this release are placed in their
-- original approval order whenever they activate.
insert into public.app_config (key, value) values ('membership_price_cents', '3000') on conflict (key) do nothing;
update public.app_config set value = '3000', updated_at = now() where key = 'membership_price_cents' and value <> '3000';

create table if not exists public.membership_activations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null check (state ~ '^[A-Z]{2}$'),
  plan text not null check (plan in ('founding', 'standard')),
  price_cents integer not null default 0,
  activated_at timestamptz not null default now()
);
alter table public.membership_activations enable row level security;
drop policy if exists "members see their own activation" on public.membership_activations;
create policy "members see their own activation" on public.membership_activations
  for select to authenticated using (profile_id = auth.uid());

alter table public.profiles add column if not exists founding_priority_at timestamptz;

do $$
begin
  if to_regclass('public.founding_places_before_v4') is null then
    create table public.founding_places_before_v4 as select * from public.founding_places;
    -- The original approval order of everyone approved before this release.
    update public.profiles p
       set founding_priority_at = greatest(coalesce(p.verified_at, p.created_at),
                                           coalesce((select min(l.reviewed_at) from licenses l
                                                      where l.profile_id = p.id and upper(trim(l.state)) = upper(trim(p.primary_state))), p.created_at))
     where p.account_kind = 'clinician' and p.verification_status = 'verified' and not p.is_demo;
    delete from public.founding_places;
  end if;
end $$;

-- Places are no longer given automatically on approval; activation gives them.
drop trigger if exists founding_place_profile on public.profiles;
drop trigger if exists founding_place_licence on public.licenses;

create or replace function public.my_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  st text;
  a membership_activations%rowtype;
  taken integer;
begin
  if me is null then
    return null;
  end if;
  select upper(trim(primary_state)) into st from profiles where id = me;
  select * into a from membership_activations where profile_id = me;
  select count(*) into taken from founding_places where state = coalesce(a.state, st);
  return jsonb_build_object(
    'activated', a.profile_id is not null,
    'activatedAt', a.activated_at,
    'plan', a.plan,
    'state', coalesce(a.state, st),
    'placesLeft', greatest(40 - taken, 0),
    'place', (select place from founding_places where profile_id = me),
    'priceCents', coalesce((select value::integer from app_config where key = 'membership_price_cents'), 3000),
    'eligible', exists (select 1 from profiles p where p.id = me and p.verification_status = 'verified' and p.account_status = 'active'
                                                   and p.account_kind = 'clinician'));
end;
$$;

create or replace function public.activate_membership(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  st text := upper(trim(coalesce(p_state, '')));
  pr profiles%rowtype;
  pri timestamptz;
  n integer;
  my_place integer;
begin
  select * into pr from profiles where id = me;
  if me is null or pr.id is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if pr.verification_status <> 'verified' or pr.account_status <> 'active' or pr.account_kind <> 'clinician' then
    raise exception 'Membership opens once your license has been verified.' using errcode = 'P0001';
  end if;
  if st !~ '^[A-Z]{2}$' then
    raise exception 'Choose your main practice state.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from licenses l where l.profile_id = me and upper(trim(l.state)) = st and l.status = 'active'
                   and l.reviewed_at is not null and (l.expiration_date is null or l.expiration_date >= current_date)) then
    raise exception 'Your main practice state needs a reviewed, current license. Add it in Credentials first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from membership_activations where profile_id = me) then
    return public.my_membership();
  end if;
  if upper(trim(coalesce(pr.primary_state, ''))) <> st then
    update profiles set primary_state = st where id = me;
  end if;
  pri := coalesce(pr.founding_priority_at, now());
  perform pg_advisory_xact_lock(hashtext('founding_places:' || st));
  select count(*) into n from founding_places where state = st;
  if n < 40 and not pr.is_demo and not private.is_sandbox_guest(me) then
    -- Renumber the state's places in approval order; this member's place is where their approval falls.
    with all_places as (
      select profile_id, granted_at from founding_places where state = st
      union all select me, pri
    ), ordered as (
      select profile_id, granted_at, row_number() over (order by granted_at, profile_id nulls last) rn from all_places
    ), cleared as (
      delete from founding_places where state = st returning 1
    )
    insert into founding_places (state, place, profile_id, granted_at)
    select st, rn, profile_id, granted_at from ordered where (select count(*) from cleared) >= 0;
    select place into my_place from founding_places where profile_id = me;
    insert into membership_activations (profile_id, state, plan, price_cents) values (me, st, 'founding', 0);
    insert into system_notifications (profile_id, title, body)
    values (me, 'You''re a founding member',
            'You''re founding member #' || my_place || ' in ' || st || '. You never pay for membership, for as long as you remain a member.');
  else
    insert into membership_activations (profile_id, state, plan, price_cents)
    values (me, st, 'standard', coalesce((select value::integer from app_config where key = 'membership_price_cents'), 3000));
  end if;
  return public.my_membership();
end;
$$;

-- Admin: membership at a glance.
create or replace function public.admin_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'priceCents', coalesce((select value::integer from app_config where key = 'membership_price_cents'), 3000),
    'states', coalesce((select jsonb_agg(jsonb_build_object('state', s.state, 'founding', s.f, 'standard', s.s) order by s.state)
                          from (select state, count(*) filter (where plan = 'founding') f, count(*) filter (where plan = 'standard') s
                                  from membership_activations group by state) s), '[]'::jsonb),
    'waiting', (select count(*) from profiles p where p.account_kind = 'clinician' and p.verification_status = 'verified'
                   and p.account_status = 'active' and not p.is_demo
                   and not exists (select 1 from membership_activations a where a.profile_id = p.id)));
end;
$$;

-- States that are building their founding circle: open to members, but referrals to the whole network wait until an
-- admin finishes the circle (decision of 5 Nov). Members keep everything already started.
alter table public.open_states add column if not exists founding_circle boolean not null default false;
do $$
begin
  if not exists (select 1 from app_config where key = 'v4_founding_circle_set') then
    update public.open_states set founding_circle = true where state in ('NY', 'MA');
    insert into public.open_states (state, open, changed_at, founding_circle)
    select s, true, now(), true from unnest(array['NY', 'MA']) s
    on conflict (state) do nothing;
    insert into app_config (key, value) values ('v4_founding_circle_set', 'true');
  end if;
end $$;

create or replace function public.admin_set_founding_circle(p_state text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare st text := upper(trim(coalesce(p_state, '')));
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  update open_states set founding_circle = coalesce(p_on, false), changed_at = now() where state = st;
  if not found then
    raise exception 'Open the state first.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.founding_circle_states()
returns text[]
language sql
stable
security definer
set search_path = public
as $$ select coalesce(array_agg(state order by state), '{}') from open_states where open and founding_circle $$;

create or replace function private.guard_founding_circle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audience_type = 'wider_network'
     and exists (select 1 from open_states where state = upper(coalesce(new.state, '')) and founding_circle) then
    raise exception 'Referrals to the whole network open in % once its founding circle is complete. Send to selected or trusted colleagues for now.',
      upper(new.state) using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists referral_founding_circle on public.referral_requests;
create trigger referral_founding_circle
  before insert on public.referral_requests
  for each row execute function private.guard_founding_circle();

-- Change details on a sent referral (X-01). The main need and the client's state decide who was asked, so changing
-- them means withdrawing and starting again ("Use as a starting point"). Everything else can change; everyone still
-- part of the referral is told, and the change shows on the referral.
create or replace function public.referral_change_details(p_referral bigint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  tf text;
  msg text;
  sec bigint;
  lang bigint;
  changed text[] := '{}';
begin
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id is distinct from me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status::text in ('connected', 'handoff', 'closed') then
    raise exception 'This referral is finished, so its details can''t change now.' using errcode = 'P0001';
  end if;
  msg := btrim(coalesce(p_payload ->> 'message', r.notes, ''));
  if length(msg) > 1000 then
    raise exception 'Keep the message under 1,000 characters.' using errcode = 'P0001';
  end if;
  tf := case p_payload ->> 'timeframe' when 'As soon as possible' then 'urgent' when 'Within two weeks' then 'within_two_weeks'
                                       when 'Within a month' then 'within_month' when 'Flexible' then 'flexible' else r.timeframe end;
  if p_payload ? 'secondary' then
    select id into sec from lookup_values where category = 'treatment_specialism' and value = p_payload ->> 'secondary';
  end if;
  if p_payload ? 'language' then
    select id into lang from lookup_values where category = 'language' and value = p_payload ->> 'language';
  end if;
  if tf is distinct from r.timeframe then changed := array_append(changed, 'timeframe'); end if;
  if msg is distinct from coalesce(r.notes, '') then changed := array_append(changed, 'message'); end if;
  if p_payload ? 'age' and nullif(p_payload ->> 'age', '') is distinct from r.age_band then changed := array_append(changed, 'age band'); end if;
  if p_payload ? 'setting' and coalesce(nullif(p_payload ->> 'setting', ''), 'either') is distinct from coalesce(r.modality, 'either') then changed := array_append(changed, 'setting'); end if;
  if p_payload ? 'insurance' and nullif(p_payload ->> 'insurance', '') is distinct from r.insurance then changed := array_append(changed, 'insurance'); end if;
  if p_payload ? 'prescribing' and (p_payload ->> 'prescribing')::boolean is distinct from r.prescribing then changed := array_append(changed, 'prescribing'); end if;
  if p_payload ? 'city' and nullif(btrim(p_payload ->> 'city'), '') is distinct from r.city then changed := array_append(changed, 'city'); end if;
  if p_payload ? 'secondary' and sec is distinct from r.specialism_lookup_ids[2] then changed := array_append(changed, 'second need'); end if;
  if p_payload ? 'language' and lang is distinct from r.language_lookup_id then changed := array_append(changed, 'language'); end if;
  if array_length(changed, 1) is null then
    return jsonb_build_object('unchanged', true);
  end if;
  update referral_requests
     set timeframe = tf,
         notes = nullif(msg, ''),
         age_band = case when p_payload ? 'age' then nullif(p_payload ->> 'age', '') else age_band end,
         modality = case when p_payload ? 'setting' then coalesce(nullif(p_payload ->> 'setting', ''), 'either') else modality end,
         insurance = case when p_payload ? 'insurance' then nullif(p_payload ->> 'insurance', '') else insurance end,
         prescribing = case when p_payload ? 'prescribing' then coalesce((p_payload ->> 'prescribing')::boolean, false) else prescribing end,
         city = case when p_payload ? 'city' then nullif(btrim(p_payload ->> 'city'), '') else city end,
         specialism_lookup_ids = case when p_payload ? 'secondary' then array_remove(array[specialism_lookup_ids[1], sec], null) else specialism_lookup_ids end,
         language_lookup_id = case when p_payload ? 'language' then lang else language_lookup_id end,
         details_changed_at = now()
   where id = p_referral;
  perform private.notify_member('referral_sent', rc.profile_id, me,
            'changed the details of Referral ' || coalesce(r.member_seq, r.id) || ' (' || array_to_string(changed, ', ') || '). Please check it still suits you.',
            '/dashboard/referrals?referral=' || r.id, 'ref_change:' || r.id || ':' || rc.profile_id || ':' || extract(epoch from now())::bigint,
            jsonb_build_object('referralRequestId', r.id))
     from referral_recipients rc
     left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
    where rc.referral_request_id = r.id and rc.closed_reason is null
      and coalesce(rs.status::text, '') not in ('unavailable', 'declined', 'withdrawn');
  return jsonb_build_object('unchanged', false, 'changed', to_jsonb(changed));
end;
$$;

-- Change details on a sent cover plan (X-01): the name, the message, the dates (including "until further notice"
-- where the reason allows it), and each client's needs other than the main need and state. Colleagues asked about,
-- or agreed for, a changed client are told.
create or replace function public.cover_change_details(p_plan bigint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  nm text;
  msg text;
  d_start date;
  d_end date;
  c jsonb;
  cs coverage_plan_cases%rowtype;
  sec bigint;
  changed_plan text[] := '{}';
  changed_cases bigint[] := '{}';
  note text;
begin
  select * into pl from coverage_plans where id = p_plan for update;
  if not found or pl.profile_id is distinct from me then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended, so its details can''t change now.' using errcode = 'P0001';
  end if;
  nm := btrim(coalesce(p_payload ->> 'name', pl.title));
  if nm = '' or length(nm) > 80 then
    raise exception 'Give the plan a short name.' using errcode = 'P0001';
  end if;
  msg := btrim(coalesce(p_payload ->> 'message', pl.notes, ''));
  if length(msg) > 1000 then
    raise exception 'Keep the message under 1,000 characters.' using errcode = 'P0001';
  end if;
  d_start := coalesce(nullif(p_payload ->> 'start', '')::date, pl.starts_on);
  d_end := case when p_payload ? 'end' then nullif(p_payload ->> 'end', '')::date else pl.ends_on end;
  if d_end is null and coalesce(pl.reason, '') not in ('closing', 'reciprocal') then
    raise exception 'Choose the last day.' using errcode = 'P0001';
  end if;
  if d_end is not null and d_end < d_start then
    raise exception 'The last day is before the first day.' using errcode = 'P0001';
  end if;
  if d_start is distinct from pl.starts_on or d_end is distinct from pl.ends_on then changed_plan := array_append(changed_plan, 'dates'); end if;
  if nm is distinct from pl.title then changed_plan := array_append(changed_plan, 'name'); end if;
  if msg is distinct from coalesce(pl.notes, '') then changed_plan := array_append(changed_plan, 'message'); end if;
  update coverage_plans set title = nm, notes = nullif(msg, ''), starts_on = d_start, ends_on = d_end, updated_at = now()
   where id = p_plan;

  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'clients', '[]'::jsonb)) loop
    select * into cs from coverage_plan_cases where id = (c ->> 'id')::bigint and coverage_plan_id = p_plan;
    continue when not found;
    sec := null;
    if c ? 'secondary' then
      select id into sec from lookup_values where category = 'treatment_specialism' and value = c ->> 'secondary';
    end if;
    if (c ? 'age' and nullif(c ->> 'age', '') is distinct from cs.age_band)
       or (c ? 'setting' and coalesce(nullif(c ->> 'setting', ''), 'either') is distinct from coalesce(cs.modality, 'either'))
       or (c ? 'insurance' and nullif(c ->> 'insurance', '') is distinct from cs.insurance)
       or (c ? 'frequency' and nullif(c ->> 'frequency', '') is distinct from cs.frequency)
       or (c ? 'prescribing' and coalesce((c ->> 'prescribing')::boolean, false) is distinct from coalesce(cs.prescribing_needed, false))
       or (c ? 'language' and nullif(c ->> 'language', '') is distinct from cs.language)
       or (c ? 'city' and nullif(btrim(c ->> 'city'), '') is distinct from cs.city)
       or (c ? 'secondary' and sec is distinct from cs.specialism_lookup_ids[2]) then
      update coverage_plan_cases
         set age_band = case when c ? 'age' then nullif(c ->> 'age', '') else age_band end,
             modality = case when c ? 'setting' then coalesce(nullif(c ->> 'setting', ''), 'either') else modality end,
             insurance = case when c ? 'insurance' then nullif(c ->> 'insurance', '') else insurance end,
             frequency = case when c ? 'frequency' then nullif(c ->> 'frequency', '') else frequency end,
             prescribing_needed = case when c ? 'prescribing' then coalesce((c ->> 'prescribing')::boolean, false) else prescribing_needed end,
             language = case when c ? 'language' then nullif(c ->> 'language', '') else language end,
             city = case when c ? 'city' then nullif(btrim(c ->> 'city'), '') else city end,
             specialism_lookup_ids = case when c ? 'secondary' then array_remove(array[specialism_lookup_ids[1], sec], null) else specialism_lookup_ids end,
             via_hub = case when c ? 'secondary' then true else via_hub end
       where id = cs.id;
      changed_cases := array_append(changed_cases, cs.id);
    end if;
  end loop;

  if array_length(changed_plan, 1) is null and array_length(changed_cases, 1) is null then
    return jsonb_build_object('unchanged', true);
  end if;
  update coverage_plans set details_changed_at = now() where id = p_plan;
  note := case when 'dates' = any (changed_plan)
               then 'changed the dates of ' || nm || ' to ' || to_char(d_start, 'Mon FMDD')
                    || case when d_end is null then ', until further notice' else ' to ' || to_char(d_end, 'Mon FMDD') end || '.'
               else 'changed the details of ' || nm || '.' end || ' Please check it still suits you.';
  perform private.notify_member('coverage_request', x.who, me, note, '/dashboard/cover?plan=' || p_plan,
            'cover_change:' || p_plan || ':' || x.who || ':' || extract(epoch from now())::bigint, jsonb_build_object('coveragePlanId', p_plan))
     from (select distinct r.requested_profile_id who
             from coverage_requests r join coverage_plan_cases k on k.id = r.coverage_plan_case_id
            where k.coverage_plan_id = p_plan
              and (r.status::text in ('sent', 'discussing') or (r.status::text = 'accepted' and k.assigned_clinician_id = r.requested_profile_id))
              and (array_length(changed_plan, 1) is not null or k.id = any (changed_cases))) x;
  return jsonb_build_object('unchanged', false, 'plan', to_jsonb(changed_plan), 'clients', to_jsonb(changed_cases));
end;
$$;

-- 5. Who can call what ----------------------------------------------------------------------------------------------
revoke all on function public.ai_status() from public, anon;
grant execute on function public.ai_status() to authenticated;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;
revoke all on function public.admin_set_ai(boolean) from public, anon;
grant execute on function public.admin_set_ai(boolean) to authenticated;
revoke all on function public.admin_ai_overview() from public, anon;
grant execute on function public.admin_ai_overview() to authenticated;
revoke all on function public.cover_confirm(bigint) from public, anon;
grant execute on function public.cover_confirm(bigint) to authenticated;
revoke all on function public.cover_agreement_reply(bigint, boolean) from public, anon;
grant execute on function public.cover_agreement_reply(bigint, boolean) to authenticated;
revoke all on function public.choose_referral_colleague(bigint, uuid) from public, anon;
grant execute on function public.choose_referral_colleague(bigint, uuid) to authenticated;
revoke all on function public.referral_agreement_reply(bigint, boolean) from public, anon;
grant execute on function public.referral_agreement_reply(bigint, boolean) to authenticated;
revoke all on function public.cover_end_plan(bigint) from public, anon;
grant execute on function public.cover_end_plan(bigint) to authenticated;
revoke all on function public.continuity_still_correct() from public, anon;
grant execute on function public.continuity_still_correct() to authenticated;
revoke all on function public.referral_close(bigint) from public, anon;
grant execute on function public.referral_close(bigint) to authenticated;
revoke all on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;
revoke all on function public.activate_membership(text) from public, anon;
grant execute on function public.activate_membership(text) to authenticated;
revoke all on function public.admin_membership() from public, anon;
grant execute on function public.admin_membership() to authenticated;
revoke all on function public.admin_set_founding_circle(text, boolean) from public, anon;
grant execute on function public.admin_set_founding_circle(text, boolean) to authenticated;
revoke all on function public.founding_circle_states() from public, anon;
grant execute on function public.founding_circle_states() to authenticated;
revoke all on function public.referral_change_details(bigint, jsonb) from public, anon;
grant execute on function public.referral_change_details(bigint, jsonb) to authenticated;
revoke all on function public.cover_change_details(bigint, jsonb) from public, anon;
grant execute on function public.cover_change_details(bigint, jsonb) to authenticated;
revoke all on function public.cover_create_plan(jsonb) from public, anon;
grant execute on function public.cover_create_plan(jsonb) to authenticated;
revoke all on function private.ai_is_on() from public, anon, authenticated;
revoke all on function private.cover_agree_check(bigint, uuid) from public, anon, authenticated;
revoke all on function private.cover_accept(bigint, uuid) from public, anon, authenticated;
revoke all on function private.referral_agree_check(bigint, uuid) from public, anon, authenticated;
revoke all on function private.referral_place(bigint, uuid) from public, anon, authenticated;
revoke all on function private.agreement_deadlines() from public, anon, authenticated;
revoke all on function private.guard_founding_circle() from public, anon, authenticated;
revoke all on function private.referral_placed_effects(bigint, uuid, uuid) from public, anon, authenticated;
revoke all on function public.referral_place(bigint, uuid) from public, anon;
grant execute on function public.referral_place(bigint, uuid) to authenticated;
