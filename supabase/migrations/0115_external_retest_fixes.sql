-- 0115: fixes from the external release retest of 17 Oct 2026.
-- Run in both projects (real, then sandbox) after the new app version is
-- live. Safe to run twice. The last statement returns one row of checks
-- that should all be true.

-- ------------------------------------------------------------------ R17-01
-- A member who is no longer eligible (suspended, unverified, or without a
-- reviewed in-date license in an open state) can't act on referrals,
-- consults, reactions or continuity duties through the app's functions,
-- and can't be chosen for a referral. Declining stays possible. Taking on
-- cover was already guarded (guard_cover_outreach, 0109).

-- Referral choice: the referring colleague and the chosen colleague must
-- both be eligible at the moment of choosing.
create or replace function public.choose_referral_colleague(p_referral bigint, p_colleague uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if v_reply is null or v_reply not in ('interested', 'accepted') then
    raise exception 'Choose a colleague who replied Interested.' using errcode = 'P0001';
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
  update referral_responses set status = 'accepted', responded_at = now()
  where referral_request_id = p_referral and responding_profile_id = p_colleague;
  update referral_requests set status = 'connected' where id = p_referral;
  return jsonb_build_object('already', false);
end;
$$;
revoke all on function public.choose_referral_colleague(bigint, uuid) from public, anon;
grant execute on function public.choose_referral_colleague(bigint, uuid) to authenticated;

-- Changing a reply: offering or asking needs an eligible account; saying
-- "not available" or withdrawing doesn't.
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
    if new.status = 'accepted' then
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

-- Reactions follow the same rule as sending a message.
create or replace function public.react_to_message(p_message bigint, p_reaction text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  conv bigint;
  current_reaction text;
begin
  if me is null then
    raise exception 'Sign in to react.' using errcode = 'P0001';
  end if;
  if p_reaction not in ('like', 'dislike', 'heart') then
    raise exception 'Unknown reaction.' using errcode = 'P0001';
  end if;
  select m.conversation_id into conv from conversation_messages m where m.id = p_message and m.deleted_at is null;
  if conv is null or not private.is_conversation_participant(conv, me) then
    raise exception 'You can only react in your own conversations.' using errcode = 'P0001';
  end if;
  if not private.can_view_network(me)
     and not exists (select 1 from conversations c where c.id = conv and private.is_admin_user(c.created_by)) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  select reaction into current_reaction from message_reactions where message_id = p_message and profile_id = me;
  if current_reaction = p_reaction then
    delete from message_reactions where message_id = p_message and profile_id = me;
    return null;
  end if;
  insert into message_reactions (message_id, profile_id, conversation_id, reaction)
  values (p_message, me, conv, p_reaction)
  on conflict (message_id, profile_id) do update set reaction = excluded.reaction, created_at = now();
  return p_reaction;
end;
$function$;

-- Agreeing to be someone's continuity backup needs an eligible account;
-- declining doesn't.
create or replace function public.respond_continuity(p_owner uuid, p_accept boolean)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  plan record;
  role text;
begin
  select * into plan from continuity_plans where profile_id = p_owner;
  if plan.profile_id is null then
    raise exception 'That plan no longer exists.' using errcode = 'P0001';
  end if;
  if plan.backup_profile_id = me and plan.backup_status in ('invited', 'accepted', 'declined') then
    role := 'backup';
  elsif plan.alternate_profile_id = me and plan.alternate_status in ('invited', 'accepted', 'declined') then
    role := 'alternate';
  else
    raise exception 'You aren''t named in this plan.' using errcode = 'P0001';
  end if;
  if p_accept and not private.is_network_member(me) then
    raise exception 'Your account isn''t active in the network right now, so you can''t agree to this. You can still decline.' using errcode = 'P0001';
  end if;
  perform set_config('pa.continuity_response', 'on', true);
  if role = 'backup' then
    update continuity_plans set backup_status = case when p_accept then 'accepted' else 'declined' end, backup_responded_at = now() where profile_id = p_owner;
  else
    update continuity_plans set alternate_status = case when p_accept then 'accepted' else 'declined' end, alternate_responded_at = now() where profile_id = p_owner;
  end if;
  perform set_config('pa.continuity_response', '', true);
  perform private.notify_member(p_owner, me,
    case when p_accept then 'agreed to be the ' || role || ' in your continuity plan' else 'can''t be the ' || role || ' in your continuity plan' end,
    '/dashboard/continuity');
  return case when p_accept then 'accepted' else 'declined' end;
end;
$function$;

-- ------------------------------------------------------------------ R17-02
-- "Useful" marks are the asker's private note. Nobody else can read the
-- column, through any path; the asker reads their marks through
-- consultation_useful_marks().
revoke select on public.consultation_responses from anon, authenticated;
grant select (id, consultation_id, responder_profile_id, response_type, body, created_at) on public.consultation_responses to authenticated;

create or replace function public.consultation_useful_marks(p_consultation bigint)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from consultation_responses r
  join consultations c on c.id = r.consultation_id
  where r.consultation_id = p_consultation
    and c.author_profile_id = auth.uid()
    and r.marked_useful;
$$;
revoke all on function public.consultation_useful_marks(bigint) from public, anon;
grant execute on function public.consultation_useful_marks(bigint) to authenticated;

create or replace function public.set_response_useful(p_response bigint, p_useful boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_author uuid;
  v_saved boolean;
begin
  select c.author_profile_id into v_author
  from consultation_responses r join consultations c on c.id = r.consultation_id
  where r.id = p_response;
  if v_author is null then
    raise exception 'Reply not found.' using errcode = 'P0001';
  end if;
  if v_author is distinct from me then
    raise exception 'Only the colleague who asked can mark a reply useful.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  update consultation_responses set marked_useful = coalesce(p_useful, false) where id = p_response
  returning marked_useful into v_saved;
  return v_saved;
end;
$$;
revoke all on function public.set_response_useful(bigint, boolean) from public, anon;
grant execute on function public.set_response_useful(bigint, boolean) to authenticated;

-- ------------------------------------------------------------------ R17-09
-- Network health for admins, counted in the database (an admin's own reads
-- of members' referrals and cover are, rightly, limited to their own). Real
-- members only: no demo accounts, demo views or admin-only logins.
create or replace function public.admin_network_health()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  result jsonb;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  with real_ids as (
    select p.id from profiles p
    where not p.is_demo and not p.demo_view and p.account_kind = 'clinician'
  )
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'state', p.primary_state, 'qualification', p.qualification_level,
        'referral', p.referral_availability, 'coverage', p.coverage_availability))
      from profiles p where p.id in (select id from real_ids) and private.is_network_member(p.id)
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'specialism', r.specialism_lookup_id, 'status', r.status))
      from referral_requests r where r.requesting_profile_id in (select id from real_ids)
    ), '[]'::jsonb),
    'referral_replies', coalesce((
      select jsonb_agg(jsonb_build_object('referral', x.referral_request_id, 'created_at', x.created_at))
      from referral_responses x join referral_requests r on r.id = x.referral_request_id
      where r.requesting_profile_id in (select id from real_ids)
    ), '[]'::jsonb),
    'cover_cases', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'created_at', c.created_at, 'specialisms', c.specialism_lookup_ids, 'status', c.status))
      from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
      where pl.profile_id in (select id from real_ids)
    ), '[]'::jsonb),
    'cover_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'case', q.coverage_plan_case_id, 'sent_at', q.sent_at, 'responded_at', q.responded_at, 'status', q.status))
      from coverage_requests q join coverage_plan_cases c on c.id = q.coverage_plan_case_id join coverage_plans pl on pl.id = c.coverage_plan_id
      where pl.profile_id in (select id from real_ids)
    ), '[]'::jsonb),
    'specialism_tags', coalesce((
      select jsonb_agg(jsonb_build_object('profile', v.profile_id, 'lookup', v.lookup_value_id))
      from profile_lookup_values v where v.profile_id in (select id from real_ids)
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_network_health() from public, anon;
grant execute on function public.admin_network_health() to authenticated;

-- ------------------------------------------------------------------ checks
select
  position('is_network_member(p_colleague)' in pg_get_functiondef('public.choose_referral_colleague(bigint,uuid)'::regprocedure)) > 0 as referral_choice_checks_colleague,
  position('is_network_member(auth.uid())' in pg_get_functiondef('public.guard_referral_response_change()'::regprocedure)) > 0 as referral_reply_checks_member,
  position('can_view_network(me)' in pg_get_functiondef('public.react_to_message(bigint,text)'::regprocedure)) > 0 as reactions_check_member,
  position('p_accept and not private.is_network_member' in pg_get_functiondef('public.respond_continuity(uuid,boolean)'::regprocedure)) > 0 as continuity_checks_member,
  position('is_network_member(me)' in pg_get_functiondef('public.set_response_useful(bigint,boolean)'::regprocedure)) > 0 as useful_checks_member,
  not has_column_privilege('authenticated', 'public.consultation_responses', 'marked_useful', 'select') as useful_mark_private,
  has_column_privilege('authenticated', 'public.consultation_responses', 'body', 'select') as replies_readable,
  to_regprocedure('public.consultation_useful_marks(bigint)') is not null as asker_reads_marks,
  to_regprocedure('public.admin_network_health()') is not null as admin_health_counts;
