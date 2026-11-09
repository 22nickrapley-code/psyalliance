-- PsyAlliance v6 (Nick's 9 Nov walkthrough).
-- Safe to run more than once. Run on the sandbox project first, then live.
--
--  1. Library: an admin can approve and publish a resource on their own (reviewer approvals become optional).
--  2. Sandbox: a guest starts with no outgoing referrals or cover plans of their own. The eight arrivals,
--     four minutes apart, are all incoming: two cover requests, two referral requests, three questions and a message.
--  3. Photos: public.workspace_photos(ids) gives the workspace each colleague's photo path in one fast call.
--
-- Rollback: re-run the definitions of public.enforce_document_publish_requirements from 0081_library_review_governance.sql,
-- private.seed_final_extras and private.sandbox_story_event from 0131_v5.sql; drop private.sandbox_clear_outgoing and public.workspace_photos.

-- 1. Library publishing
CREATE OR REPLACE FUNCTION public.enforce_document_publish_requirements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  missing_roles text[];
  content_changed boolean;
begin
  content_changed := tg_op = 'UPDATE' and (
    new.storage_path is distinct from old.storage_path
    or new.title is distinct from old.title
    or new.summary is distinct from old.summary
    or new.applicability is distinct from old.applicability
    or new.customization_warning is distinct from old.customization_warning
  );
  -- Editing reviewed content makes a new version that needs review again.
  if content_changed and old.review_status in ('published', 'provisional') and new.version = old.version then
    new.version := old.version + 1;
    if old.review_status = 'published' then
      new.review_status := 'in_review';
      new.review_date := null;
    end if;
  end if;

  if new.review_status = 'published' and (tg_op = 'INSERT' or old.review_status is distinct from 'published' or old.version is distinct from new.version) then
    -- v6 (Nick, 9 Nov): an admin may approve and publish a resource on their own; reviewer approvals are optional.
    if auth.uid() is not null and private.is_admin_user(auth.uid()) then
      return new;
    end if;
    if coalesce(array_length(new.required_reviewer_roles, 1), 0) = 0 then
      raise exception 'Cannot publish "%": set the reviewer roles it needs first.', new.title using errcode = 'P0001';
    end if;
    select array_agg(role) into missing_roles
    from unnest(new.required_reviewer_roles) as role
    where not exists (
      select 1 from document_reviews dr
      join library_reviewers lr on lr.profile_id = dr.reviewer_profile_id and lr.role = dr.reviewer_role and lr.active
      where dr.document_id = new.id
        and dr.document_version = new.version
        and dr.reviewer_role = role
        and dr.approved = true
        and dr.invalidated_at is null
    );
    if missing_roles is not null and array_length(missing_roles, 1) > 0 then
      raise exception 'Cannot publish "%": needs an independent approval from: %', new.title, replace(array_to_string(missing_roles, ', '), '_', ' ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

-- 2. Sandbox: an empty outgoing start
create or replace function private.sandbox_clear_outgoing(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  plans bigint[];
  refs bigint[];
begin
  -- Only ever a sandbox guest (a demo profile on the sandbox site); the pass is linked after seeding.
  if coalesce(private.cfg('app_env'), '') <> 'demo' or not private.profile_is_demo(p_viewer) then
    return;
  end if;
  select coalesce(array_agg(id), '{}') into plans from coverage_plans where profile_id = p_viewer;
  select coalesce(array_agg(id), '{}') into refs from referral_requests where requesting_profile_id = p_viewer;
  delete from conversations c
   where exists (select 1 from unnest(plans) pid where c.context_key like 'cover-' || pid || '-%')
      or exists (select 1 from unnest(refs) rid where c.context_key like 'referral-' || rid || '-%');
  delete from notification_events e
   where (e.metadata ->> 'coveragePlanId') ~ '^[0-9]+$' and (e.metadata ->> 'coveragePlanId')::bigint = any (plans)
      or (e.metadata ->> 'referralRequestId') ~ '^[0-9]+$' and (e.metadata ->> 'referralRequestId')::bigint = any (refs);
  delete from coverage_plans where id = any (plans);
  delete from referral_requests where id = any (refs);
  delete from private.demo_rows where owner = p_viewer and ((tbl = 'coverage_plans' and id = any (plans)) or (tbl = 'referral_requests' and id = any (refs)));
end;
$function$;
revoke all on function private.sandbox_clear_outgoing(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.seed_final_extras(p_viewer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  ids jsonb := private.demo_cast_ids();
  oldest bigint;
begin
  update profiles set availability_paused_until = current_date + 21 where id = (ids ->> 'talia')::uuid;
  update profiles set coverage_availability = 'no' where id = (ids ->> 'lena')::uuid;

  select c.id into oldest
    from consultations c
    join private.demo_rows dr on dr.tbl = 'consultations' and dr.id = c.id and dr.owner = p_viewer
   where c.status in ('open', 'responses_received')
     and c.author_profile_id <> p_viewer
     and c.audience_type = 'wider_network'
     and exists (select 1 from consultation_responses r where r.consultation_id = c.id)
   order by c.created_at asc
   limit 1;
  if oldest is not null and not exists (
    select 1 from consultations c join private.demo_rows dr on dr.tbl = 'consultations' and dr.id = c.id and dr.owner = p_viewer where c.status = 'resolved') then
    update consultations set status = 'resolved', resolved_at = now() - interval '2 days' where id = oldest;
  end if;
  -- v5: nothing waiting at the start.
  perform private.sandbox_quiet_start(p_viewer);
  -- v6 (Nick, 9 Nov): no outgoing plans or referrals waiting at the start; the sandbox reacts to what the guest does.
  perform private.sandbox_clear_outgoing(p_viewer);
end;
$function$;
revoke all on function private.seed_final_extras(uuid) from public, anon, authenticated;

-- 2b. The eight arrivals
CREATE OR REPLACE FUNCTION private.sandbox_story_event(p_viewer uuid, p_step integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint;
  m jsonb; r jsonb; out jsonb := null;
  imani uuid; eli uuid; lena uuid; marcus uuid; sophie uuid; rena uuid; james uuid; maya uuid;
  key text; ref bigint; plan bigint; cid bigint; conv bigint;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return null;
  end if;
  select s.id into pass_id from sandbox_passes s where s.guest_id = p_viewer;
  if pass_id is not null then
    update sandbox_passes set guest_id = null where id = pass_id;
  end if;
  perform set_config('pa.sandbox_owner', p_viewer::text, true);
  m := private.demo_cast_ids();
  imani := (m ->> 'imani')::uuid; eli := (m ->> 'eli')::uuid; lena := (m ->> 'lena')::uuid; marcus := (m ->> 'marcus')::uuid;
  sophie := (m ->> 'sophie')::uuid; rena := (m ->> 'rena')::uuid; james := (m ->> 'james')::uuid; maya := (m ->> 'maya')::uuid;

  begin
    if p_step = 1 then
      perform private.demo_as(eli);
      r := public.cover_create_plan(jsonb_build_object(
        'requestId', md5('story-3-' || p_viewer)::uuid, 'name', 'Winter holiday cover', 'reason', 'short', 'other', '',
        'start', to_char(current_date + 60, 'YYYY-MM-DD'), 'end', to_char(current_date + 70, 'YYYY-MM-DD'),
        'mode', 'sequential', 'deadline', 48, 'message', 'Would you be able to help with temporary cover over the holidays? A brief conversation would be useful.',
        'clients', jsonb_build_array(private.demo_client('Client 1', 'Anxiety/Panic Disorders', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
      if jsonb_array_length(r -> 'dropped') = 0 then
        plan := (r ->> 'planId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 1, 'kind', 'cover', 'title', 'Eli Kestrelby asked you about temporary cover',
          'body', 'Winter holiday cover, one client. Answer, or ask a question first.', 'view', 'cover', 'id', plan);
      end if;
    elsif p_step = 2 then
      perform private.demo_as(lena);
      r := public.referral_create(jsonb_build_object(
        'requestId', md5('story-4-' || p_viewer)::uuid, 'state', 'VT', 'setting', 'virtual', 'focus', 'Depression', 'secondary', '', 'age', 'Adults',
        'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
        'timeframe', 'Within a month', 'message', 'Weekly virtual sessions, mornings if possible.', 'prescribing', false));
      if jsonb_array_length(r -> 'dropped') = 0 then
        ref := (r ->> 'referralId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 2, 'kind', 'referral', 'title', 'Lena Larkhollow sent you a referral request',
          'body', 'An adult with depression in Vermont, by video. Say whether you can accept.', 'view', 'referrals', 'id', ref);
      end if;
    elsif p_step = 3 then
      perform private.demo_as(rena);
      r := public.consult_post(jsonb_build_object(
        'clientRequestId', md5('story-v5-6-' || p_viewer)::uuid, 'title', 'How do you end with a client who keeps postponing the last session?',
        'body', 'We agreed to finish a month ago and the last session has moved three times. I would value how you would raise it.',
        'topic', 'Clinical practice', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'one', 'recipients', jsonb_build_array(p_viewer)));
      cid := (r ->> 'id')::bigint;
      insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 3, 'kind', 'consult', 'title', 'Rena Mitchell asked you a question',
        'body', 'Ending with a client who keeps postponing the last session.', 'view', 'consult', 'id', cid);
    elsif p_step = 4 then
      perform private.demo_as(sophie);
      r := public.cover_create_plan(jsonb_build_object(
        'requestId', md5('story-v6-4-' || p_viewer)::uuid, 'name', 'Conference week cover', 'reason', 'short', 'other', '',
        'start', to_char(current_date + 24, 'YYYY-MM-DD'), 'end', to_char(current_date + 30, 'YYYY-MM-DD'),
        'mode', 'sequential', 'deadline', 48, 'message', 'I am away at a conference for a week. Could you see one client for a single session if anything comes up? Happy to talk it through first.',
        'clients', jsonb_build_array(private.demo_client('Client 1', 'Depression', 'MA', '', 'either', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
      if jsonb_array_length(r -> 'dropped') = 0 then
        plan := (r ->> 'planId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 4, 'kind', 'cover', 'title', 'Sophie Chen asked if you can cover',
          'body', 'Conference week cover, one client. Answer, or ask a question first.', 'view', 'cover', 'id', plan);
      end if;
    elsif p_step = 5 then
      perform private.demo_as(marcus);
      r := public.consult_post(jsonb_build_object(
        'clientRequestId', md5('story-5-' || p_viewer)::uuid, 'title', 'Missed sessions with clients who travel for work',
        'body', 'How do you handle repeated missed or rescheduled sessions with clients whose work takes them away? I am weighing a flexible policy against a firmer one.',
        'topic', 'Professional life', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'network'));
      cid := (r ->> 'id')::bigint;
      insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 5, 'kind', 'consult', 'title', 'Marcus Reed asked the network a question',
        'body', 'Missed sessions with clients who travel for work.', 'view', 'consult', 'id', cid);
    elsif p_step = 6 then
      perform private.demo_as(maya);
      r := public.referral_create(jsonb_build_object(
        'requestId', md5('story-v6-6-' || p_viewer)::uuid, 'state', 'NY', 'setting', 'either', 'focus', 'Trauma/PTSD', 'secondary', '', 'age', 'Adults',
        'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
        'timeframe', 'Within two weeks', 'message', 'An adult client who would benefit from trauma-focused work. My waitlist is full. Video or in person both work for them.', 'prescribing', false));
      if jsonb_array_length(r -> 'dropped') = 0 then
        ref := (r ->> 'referralId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 6, 'kind', 'referral', 'title', 'Maya Patel sent you a referral request',
          'body', 'An adult with trauma in New York. Say whether you can accept, or ask a question.', 'view', 'referrals', 'id', ref);
      end if;
    elsif p_step = 7 then
      perform private.demo_as(imani);
      key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
      perform public.message_send(key, 'Hi Rachel, I hope your week is going well. I have a client moving from New York to Massachusetts in the spring. Would you be open to a short call next week about continuity of care? Nothing urgent.', md5('story-v5-3-' || p_viewer)::uuid);
      conv := private.demo_conv(key);
      insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 7, 'kind', 'message', 'title', 'Imani Ambershaw sent you a message',
        'body', 'Would you be open to a short call about a client moving to Massachusetts?', 'view', 'messages', 'key', key);
    elsif p_step = 8 then
      select c.id into cid from consultations c where c.author_profile_id = james and c.client_request_id = md5('seed-consult-few-' || p_viewer)::uuid;
      if cid is not null then
        perform private.demo_as(james);
        perform public.consult_reply(cid, 'Thank you, Rachel. A regular social anchor is a good way to put it. I will try that before anything more structured.', md5('story-v5-7-' || p_viewer)::uuid);
        out := jsonb_build_object('step', 8, 'kind', 'consult', 'title', 'James Wilson replied to his question',
          'body', 'Grief work with older adults: he thanked you for your reply.', 'view', 'consult', 'id', cid);
      else
        perform private.demo_as(lena);
        key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
        perform public.message_send(key, 'Hi Rachel, thank you for being open to referrals from Vermont. I will keep you in mind for adults who prefer video.', md5('story-v6-8-' || p_viewer)::uuid);
        conv := private.demo_conv(key);
        insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 8, 'kind', 'message', 'title', 'Lena Larkhollow sent you a message',
          'body', 'A thank-you for being open to referrals from Vermont.', 'view', 'messages', 'key', key);
      end if;
    end if;
  exception when others then
    raise warning 'sandbox_story_event(%, %): %', p_viewer, p_step, sqlerrm;
    out := null;
  end;

  perform set_config('pa.sandbox_owner', '', true);
  perform private.demo_restore(saved_claims, saved_sub);
  if pass_id is not null then
    update sandbox_passes set guest_id = p_viewer where id = pass_id;
  end if;
  return out;
end;
$function$;
revoke all on function private.sandbox_story_event(uuid, integer) from public, anon, authenticated;

-- 3. Photos in the workspace (v6): avatar paths for the colleagues a member's workspace already shows, in one fast call.
create or replace function public.workspace_photos(p_ids uuid[])
returns table(id uuid, avatar_path text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.avatar_path
    from profiles p
   where auth.uid() is not null
     and p.id = any (p_ids[1:400])
     and p.avatar_path is not null
     and (p.id = auth.uid()
          or (p.verification_status = 'verified' and p.account_status = 'active' and p.is_demo = public.viewer_is_demo()
              and not public.is_blocked_between(auth.uid(), p.id)));
$function$;
revoke all on function public.workspace_photos(uuid[]) from public, anon;
grant execute on function public.workspace_photos(uuid[]) to authenticated;

notify pgrst, 'reload schema';
