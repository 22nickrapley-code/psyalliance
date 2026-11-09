-- 0131_v5.sql: Nick's 8 Nov walkthrough (v5). Idempotent: safe to run twice.
-- Run on the sandbox project first, then the live project. Nothing here deletes member data.
--
-- 1. Consultation groups behind a switch (app_config consult_groups, off by default; admin page Features).
-- 2. Consult audiences: "Worked with before" and "Suggested by PsyAlliance".
-- 3. A reply to a resolved question is allowed from the SQL editor (re-seeding the sandbox network failed).
-- 4. Sandbox pacing: nothing waiting at the start, the first colleague after about two minutes,
--    then one every four minutes, eight at most; no group invitation in the story.
-- 5. Sandbox: colleagues answer the guest's own requests more calmly.
-- 6. Founding places left are shown for every open state.

-- 1. Consultation groups switch ---------------------------------------------------
insert into public.app_config (key, value) values ('consult_groups', 'false') on conflict (key) do nothing;

create or replace function private.consult_groups_on()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_config where key = 'consult_groups'), 'false') = 'true';
$$;
revoke all on function private.consult_groups_on() from public, anon, authenticated;

-- What the workspace needs to know about this site's switches (read on every page load).
create or replace function public.feature_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('consultGroups', private.consult_groups_on());
$$;
revoke all on function public.feature_flags() from public, anon;
grant execute on function public.feature_flags() to authenticated;

create or replace function public.admin_features()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'consultGroups', private.consult_groups_on(),
    'changedAt', (select updated_at from app_config where key = 'consult_groups'),
    'changedBy', (select value from app_config where key = 'consult_groups_by'),
    'groups', (select count(*) from consultation_groups));
end;
$$;
revoke all on function public.admin_features() from public, anon;
grant execute on function public.admin_features() to authenticated;

create or replace function public.admin_set_consult_groups(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  insert into app_config (key, value, updated_at) values ('consult_groups', case when p_on then 'true' else 'false' end, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value, updated_at) values ('consult_groups_by', coalesce(private.member_name(auth.uid()), 'An admin'), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.admin_features();
end;
$$;
revoke all on function public.admin_set_consult_groups(boolean) from public, anon;
grant execute on function public.admin_set_consult_groups(boolean) to authenticated;

-- 3. Re-seeding the sandbox network posts replies to questions it has already marked resolved.
-- The guard is for members; a statement run in the SQL editor (no signed-in caller) is let through.
create or replace function private.consult_no_reply_when_resolved()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('pa.seeding', true) = 'on' or auth.uid() is null then
    return new;
  end if;
  if exists (select 1 from consultations c where c.id = new.consultation_id and c.status = 'resolved') then
    raise exception 'This question has been marked resolved, so it is not taking new replies.' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
revoke all on function private.consult_no_reply_when_resolved() from public, anon, authenticated;

-- 2. Consult audiences: worked with before, suggested by PsyAlliance -------------------
alter table public.consultations add column if not exists audience_label text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consultations_audience_label_check') then
    alter table public.consultations add constraint consultations_audience_label_check check (audience_label is null or audience_label in ('worked', 'suggested'));
  end if;
end $$;

create or replace function public.consult_post(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  cid uuid := nullif(p_payload->>'clientRequestId', '')::uuid;
  v_title text := btrim(coalesce(p_payload->>'title', ''));
  v_body text := btrim(coalesce(p_payload->>'body', ''));
  v_topic text := btrim(coalesce(p_payload->>'topic', ''));
  v_aud text := coalesce(p_payload->>'audience', '');
  v_tags text[];
  v_ids uuid[] := '{}';
  v_group bigint;
  v_type text;
  v_new bigint;
  v_recipients uuid[] := '{}';
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can post to the network.' using errcode = 'P0001';
  end if;
  if cid is not null then
    select c.id into v_new from consultations c where c.author_profile_id = me and c.client_request_id = cid;
    if found then
      return jsonb_build_object('id', v_new, 'existing', true);
    end if;
  end if;
  if v_title = '' then
    raise exception 'Write your question in one sentence.' using errcode = 'P0001';
  end if;
  if char_length(v_title) > 150 or char_length(v_body) > 5000 then
    raise exception 'That is a little long. Shorten the question or the context.' using errcode = 'P0001';
  end if;
  if coalesce(p_payload->>'confirmed', '') <> 'true' then
    raise exception 'Confirm the question contains no client-identifying details.' using errcode = 'P0001';
  end if;
  if v_topic <> '' and v_topic not in ('Clinical practice', 'Professional life', 'Resources', 'Community', 'Consultation') then
    raise exception 'Choose one of the listed topics.' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(t), '{}') into v_tags
    from (select distinct on (lower(btrim(x))) left(btrim(x), 40) t
            from jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb)) x
           where btrim(x) <> '' and lower(btrim(x)) <> lower(v_topic) limit 10) s;

  if v_aud = 'trusted' then
    v_type := 'trusted';
    v_recipients := array(select t.colleague_id from trusted_colleagues t where t.profile_id = me);
  elsif v_aud = 'network' then
    v_type := 'wider_network';
  elsif v_aud in ('worked', 'suggested') then
    -- v5: the colleagues the member has worked with before, or PsyAlliance's suggestions for them, as listed on
    -- their Network page at the moment they post (trusted colleagues are their own audience). Stored as named people.
    v_type := 'selected';
    if v_aud = 'worked' then
      v_ids := array(select w.colleague_id from private.workspace_worked(me) w
                      where w.colleague_id in (select v.id from private.visible_members(me) v)
                        and w.colleague_id not in (select t.colleague_id from trusted_colleagues t where t.profile_id = me)
                      order by w.at desc limit 50);
    else
      v_ids := array(select s.colleague_id from suggested_colleagues s
                      where s.profile_id = me and s.colleague_id in (select v.id from private.visible_members(me) v)
                        and s.colleague_id not in (select t.colleague_id from trusted_colleagues t where t.profile_id = me)
                        and s.colleague_id not in (select w.colleague_id from private.workspace_worked(me) w)
                      order by s.position limit 50);
    end if;
    if coalesce(array_length(v_ids, 1), 0) = 0 then
      raise exception 'There is nobody in that list yet. Choose another audience.' using errcode = 'P0001';
    end if;
    v_recipients := v_ids;
  elsif v_aud in ('one', 'few') then
    v_type := 'selected';
    select coalesce(array_agg(distinct x::uuid), '{}') into v_ids from jsonb_array_elements_text(coalesce(p_payload->'recipients', '[]'::jsonb)) x;
    if coalesce(array_length(v_ids, 1), 0) = 0 or (v_aud = 'one' and array_length(v_ids, 1) <> 1) or array_length(v_ids, 1) > 50 then
      raise exception 'Choose who should see this.' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_ids) i where i not in (select v.id from private.visible_members(me) v)) then
      raise exception 'You can''t send this to one of those colleagues.' using errcode = 'P0001';
    end if;
    v_recipients := v_ids;
  elsif v_aud = 'group' then
    -- Seeding (the sandbox's own Thursday Circle) is allowed; members are refused while the switch is off.
    if not private.consult_groups_on() and coalesce(current_setting('pa.seeding', true), '') <> 'on' then
      raise exception 'Consultation groups are not available just now. Choose another audience.' using errcode = 'P0001';
    end if;
    v_type := 'selected';
    v_group := nullif(p_payload->>'groupId', '')::bigint;
    if v_group is null or not private.is_consultation_group_member(v_group, me) then
      raise exception 'Only members of this group can post to it.' using errcode = 'P0001';
    end if;
    v_recipients := array(select m.profile_id from consultation_group_members m where m.group_id = v_group and m.status = 'joined' and m.profile_id is not null);
  else
    raise exception 'Choose who should see this.' using errcode = 'P0001';
  end if;

  begin
    insert into consultations (author_profile_id, question, context, audience_type, audience_profile_ids, tags, topic, deidentification_confirmed, status, kind, group_id, client_request_id, audience_label)
    values (me, v_title, nullif(v_body, ''), v_type, case when v_aud in ('one', 'few', 'worked', 'suggested') then v_ids else '{}' end, v_tags, nullif(v_topic, ''), true, 'open', 'question', v_group, cid,
            case when v_aud in ('worked', 'suggested') then v_aud end)
    returning id into v_new;
  exception when unique_violation then
    select c.id into v_new from consultations c where c.author_profile_id = me and c.client_request_id = cid;
    return jsonb_build_object('id', v_new, 'existing', true);
  end;

  insert into consultation_follows (profile_id, consultation_id) values (me, v_new) on conflict do nothing;
  perform private.professional_event('consultation_created', me, null, 'opened a consultation', jsonb_build_object('consultationId', v_new, 'audienceType', v_type));

  -- Colleagues asked directly are told; those who set consult to "Not now", the
  -- author, and anyone blocked either way are not.
  perform private.notify_member('consultation_invite', r, me, 'asked you for your input', '/dashboard/consult?discussion=' || v_new, 'consult:' || v_new, jsonb_build_object('consultationId', v_new))
    from unnest(v_recipients) r
   where r <> me
     and r in (select v.id from private.visible_members(me) v)
     and not exists (select 1 from profiles p where p.id = r and p.consultation_availability = 'no');
  return jsonb_build_object('id', v_new, 'existing', false);
end;
$function$;
revoke all on function public.consult_post(jsonb) from public, anon;
grant execute on function public.consult_post(jsonb) to authenticated;

create or replace function private.discussion_json(p_id bigint, p_viewer uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', c.id,
    'person', case when c.author_profile_id = p_viewer then 'me' else c.author_profile_id::text end,
    'title', c.question,
    'text', coalesce(c.context, ''),
    'tag', coalesce(nullif(c.topic, ''), 'Consultation'),
    'tags', to_jsonb(array[coalesce(nullif(c.topic, ''), 'Consultation')] || coalesce(c.tags, '{}'::text[])),
    'audience', case when c.group_id is not null then 'group'
                     when c.audience_label is not null then c.audience_label
                     when c.audience_type = 'trusted' then 'trusted'
                     when c.audience_type = 'wider_network' then 'network'
                     when coalesce(array_length(c.audience_profile_ids, 1), 0) <= 1 then 'one'
                     else 'few' end,
    'groupId', c.group_id,
    'kind', c.kind,
    'status', c.status,
    'createdAt', c.created_at,
    'replies', (select count(*) from consultation_responses r where r.consultation_id = c.id and not public.is_blocked_between(p_viewer, r.responder_profile_id)),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', 'r' || x.id,
               'person', case when x.responder_profile_id = p_viewer then 'me' else x.responder_profile_id::text end,
               'text', x.body,
               'type', x.response_type,
               'createdAt', x.created_at) order by x.created_at desc, x.id desc)
        from (select r.* from consultation_responses r
               where r.consultation_id = c.id and not public.is_blocked_between(p_viewer, r.responder_profile_id)
               order by r.created_at desc, r.id desc limit p_limit) x), '[]'::jsonb))
  from consultations c where c.id = p_id;
$function$;
revoke all on function private.discussion_json(bigint, uuid, integer) from public, anon, authenticated;

-- 6. Founding places left: shown for every open state, always (Nick, 8 Nov). -----------------------
create or replace function public.founding_places_left()
returns table(state text, taken integer, places_left integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  select o.state, coalesce(f.n, 0)::integer, greatest(40 - coalesce(f.n, 0), 0)::integer
    from open_states o
    left join (select fp.state, count(*) as n from founding_places fp group by fp.state) f on f.state = o.state
   where o.open
   order by o.state;
$function$;
revoke all on function public.founding_places_left() from public;
grant execute on function public.founding_places_left() to anon, authenticated;

-- 4. Sandbox pacing (Nick, 8 Nov: nine actions at the start and 26 notifications in 15 minutes) --------
-- The guest starts with history but nothing waiting for them. The first colleague gets in touch after about
-- two minutes, then one every four minutes, eight in all. The workspace holds arrivals while a guided task is open.

-- Nothing waiting at the start. Runs inside seeding (and again when the story starts again), so each move is
-- tried on its own and skipped if it has already happened.
create or replace function private.sandbox_quiet_start(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  m jsonb := private.demo_cast_ids();
  maya uuid := (m ->> 'maya')::uuid; eli uuid := (m ->> 'eli')::uuid; alex uuid := (m ->> 'alex')::uuid;
  james uuid := (m ->> 'james')::uuid; lena uuid := (m ->> 'lena')::uuid;
  ref bigint; plan bigint; cid bigint;
begin
  -- Rachel's New York referral: Maya said she could take it, so it is placed with her and Maya has confirmed.
  select rr.id into ref from referral_requests rr join private.demo_rows d on d.tbl = 'referral_requests' and d.id = rr.id and d.owner = p_viewer
   where rr.requesting_profile_id = p_viewer and rr.state = 'NY' and rr.status in ('open', 'sent', 'matched')
     and exists (select 1 from referral_responses x where x.referral_request_id = rr.id and x.responding_profile_id = maya and x.status::text in ('interested', 'accepted'))
   order by rr.id limit 1;
  if ref is not null then
    begin
      perform private.demo_as(p_viewer);
      perform public.referral_place(ref, maya);
      begin
        perform private.demo_as(maya);
        perform public.referral_agreement_reply(ref, true);
      exception when others then null;
      end;
    exception when others then
      raise warning 'sandbox_quiet_start referral %: %', ref, sqlerrm;
    end;
  end if;

  -- Eli's referral to Rachel: she has said she can take it; Eli decides.
  for ref in
    select rr.id from referral_requests rr join private.demo_rows d on d.tbl = 'referral_requests' and d.id = rr.id and d.owner = p_viewer
     where rr.requesting_profile_id = eli and rr.status in ('open', 'sent', 'matched')
       and not exists (select 1 from referral_responses x where x.referral_request_id = rr.id and x.responding_profile_id = p_viewer)
  loop
    begin
      perform private.demo_as(p_viewer);
      perform public.referral_answer(ref, 'interested', true);
    exception when others then
      raise warning 'sandbox_quiet_start eli referral %: %', ref, sqlerrm;
    end;
  end loop;

  -- Rachel's Fall leave: the handover for Client 2 (Maya covering) is confirmed.
  select p.id into plan from coverage_plans p join private.demo_rows d on d.tbl = 'coverage_plans' and d.id = p.id and d.owner = p_viewer
   where p.profile_id = p_viewer and p.title like 'Fall leave%' limit 1;
  if plan is not null then
    begin
      perform private.demo_as(p_viewer);
      perform public.cover_confirm_handover(plan, private.demo_case(plan, 'Client 2'), true, true, true);
    exception when others then
      raise warning 'sandbox_quiet_start handover %: %', plan, sqlerrm;
    end;
  end if;

  -- Alex's October practice cover: Rachel has answered for both clients.
  select p.id into plan from coverage_plans p join private.demo_rows d on d.tbl = 'coverage_plans' and d.id = p.id and d.owner = p_viewer
   where p.profile_id = alex and p.title = 'October practice cover' limit 1;
  if plan is not null then
    begin
      perform private.demo_as(p_viewer);
      perform public.cover_answer(private.demo_req(plan, 'Client 1', p_viewer), 'accepted', null, md5('quiet-cover-' || plan)::uuid);
    exception when others then
      raise warning 'sandbox_quiet_start alex cover %: %', plan, sqlerrm;
    end;
  end if;

  -- The two questions asked of Rachel directly: she has replied.
  select c.id into cid from consultations c where c.author_profile_id = james and c.client_request_id = md5('seed-consult-few-' || p_viewer)::uuid;
  if cid is not null and not exists (select 1 from consultation_responses r where r.consultation_id = cid and r.responder_profile_id = p_viewer) then
    begin
      perform private.demo_as(p_viewer);
      perform public.consult_reply(cid, 'What has helped most for me is a regular, low-key social anchor: a weekly call, a class, a volunteering slot. Grief frameworks fit better once isolation is eased a little.', md5('quiet-few-' || cid)::uuid);
    exception when others then
      raise warning 'sandbox_quiet_start reply %: %', cid, sqlerrm;
    end;
  end if;
  cid := null;
  select c.id into cid from consultations c where c.author_profile_id = lena and c.client_request_id = md5('seed-consult-one-' || p_viewer)::uuid;
  if cid is not null and not exists (select 1 from consultation_responses r where r.consultation_id = cid and r.responder_profile_id = p_viewer) then
    begin
      perform private.demo_as(p_viewer);
      perform public.consult_reply(cid, 'Happy to. Name the state the client is in at each session, say what happens if they travel, and keep the emergency plan local to them. Send it over whenever suits you.', md5('quiet-one-' || cid)::uuid);
    exception when others then
      raise warning 'sandbox_quiet_start reply %: %', cid, sqlerrm;
    end;
  end if;

  -- Every conversation and notification so far has been read.
  update conversation_participants cp set last_read_at = now()
   where cp.profile_id = p_viewer
     and cp.conversation_id in (select d.id from private.demo_rows d where d.tbl = 'conversations' and d.owner = p_viewer);
  update conversation_participants cp set last_read_at = now()
   where cp.profile_id = p_viewer and cp.last_read_at < now();
  update notification_deliveries d set read_at = coalesce(d.read_at, now())
   where d.recipient_profile_id = p_viewer and d.channel = 'in_app' and d.read_at is null;
end;
$function$;
revoke all on function private.sandbox_quiet_start(uuid) from public, anon, authenticated;

create or replace function private.seed_final_extras(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
end;
$function$;
revoke all on function private.seed_final_extras(uuid) from public, anon, authenticated;

create or replace function private.seed_demo_viewer_story(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  insert into private.sandbox_story (profile_id, step, next_at) values (p_viewer, 0, now() + interval '120 seconds')
  on conflict (profile_id) do update set step = 0, next_at = now() + interval '120 seconds';
  perform private.seed_final_extras(p_viewer);
end;
$function$;
revoke all on function private.seed_demo_viewer_story(uuid) from public, anon, authenticated;

create or replace function public.sandbox_tick(p_force boolean default false)
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
  if st.profile_id is null or st.step >= 8 then
    return null;
  end if;
  if not coalesce(p_force, false) and now() < st.next_at then
    return null;
  end if;
  result := private.sandbox_story_event(me, st.step + 1);
  update private.sandbox_story set step = st.step + 1, next_at = now() + interval '4 minutes' where profile_id = me;
  return result;
end;
$function$;
revoke all on function public.sandbox_tick(boolean) from public, anon;
grant execute on function public.sandbox_tick(boolean) to authenticated;

create or replace function public.sandbox_info()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('label', s.label, 'expiresAt', s.expires_at,
                            'arrivals', jsonb_build_object('done', coalesce(st.step, 0), 'total', 8, 'nextAt', st.next_at))
    from sandbox_passes s left join private.sandbox_story st on st.profile_id = s.guest_id
   where s.guest_id = auth.uid() and coalesce(private.cfg('app_env'), '') = 'demo';
$function$;
revoke all on function public.sandbox_info() from public, anon;
grant execute on function public.sandbox_info() to authenticated;

-- The story: eight colleagues get in touch, one at a time. No group invitation (groups are behind a switch).
create or replace function private.sandbox_story_event(p_viewer uuid, p_step integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
      perform private.demo_as(imani);
      key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
      perform public.message_send(key, 'Hi Rachel, I hope your week is going well. I have a client moving from New York to Massachusetts in the spring. Would you be open to a short call next week about continuity of care? Nothing urgent.', md5('story-v5-3-' || p_viewer)::uuid);
      conv := private.demo_conv(key);
      insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 3, 'kind', 'message', 'title', 'Imani Ambershaw sent you a message',
        'body', 'Would you be open to a short call about a client moving to Massachusetts?', 'view', 'messages', 'key', key);
    elsif p_step = 4 then
      select p.id into plan from coverage_plans p join private.demo_rows d on d.tbl = 'coverage_plans' and d.id = p.id and d.owner = p_viewer
       where p.profile_id = p_viewer and p.title like 'Fall leave%' limit 1;
      if plan is not null then
        perform private.demo_as(sophie);
        perform public.cover_answer(private.demo_req(plan, 'Client 3', sophie), 'accepted', null, md5('story-v5-4-' || p_viewer)::uuid);
        out := jsonb_build_object('step', 4, 'kind', 'cover', 'title', 'Sophie Chen can cover Client 3',
          'body', 'Fall leave cover. Agree cover with her, or keep looking.', 'view', 'cover', 'id', plan);
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
      perform private.demo_as(rena);
      r := public.consult_post(jsonb_build_object(
        'clientRequestId', md5('story-v5-6-' || p_viewer)::uuid, 'title', 'How do you end with a client who keeps postponing the last session?',
        'body', 'We agreed to finish a month ago and the last session has moved three times. I would value how you would raise it.',
        'topic', 'Clinical practice', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'one', 'recipients', jsonb_build_array(p_viewer)));
      cid := (r ->> 'id')::bigint;
      insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 6, 'kind', 'consult', 'title', 'Rena Mitchell asked you a question',
        'body', 'Ending with a client who keeps postponing the last session.', 'view', 'consult', 'id', cid);
    elsif p_step = 7 then
      select c.id into cid from consultations c where c.author_profile_id = james and c.client_request_id = md5('seed-consult-few-' || p_viewer)::uuid;
      if cid is not null then
        perform private.demo_as(james);
        perform public.consult_reply(cid, 'Thank you, Rachel. A regular social anchor is a good way to put it. I will try that before anything more structured.', md5('story-v5-7-' || p_viewer)::uuid);
        out := jsonb_build_object('step', 7, 'kind', 'consult', 'title', 'James Wilson replied to his question',
          'body', 'Grief work with older adults: he thanked you for your reply.', 'view', 'consult', 'id', cid);
      end if;
    elsif p_step = 8 then
      perform private.demo_as(maya);
      key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
      perform public.message_send(key, 'Hi Rachel, just to let you know the client you referred in New York has settled in well. Thank you for thinking of me.', md5('story-v5-8-' || p_viewer)::uuid);
      conv := private.demo_conv(key);
      insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 8, 'kind', 'message', 'title', 'Maya Patel sent you a message',
        'body', 'The client you referred has settled in well.', 'view', 'messages', 'key', key);
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

-- 5. Sandbox: colleagues answer the guest's own requests more calmly ------------------
CREATE OR REPLACE FUNCTION private.demo_autorespond()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r record;
  acted integer := 0;
  pass_ids bigint[]; guests uuid[];
  h integer; resp text; conv_key text; body text;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return 0;
  end if;
  select coalesce(array_agg(s.id), '{}'), coalesce(array_agg(s.guest_id), '{}') into pass_ids, guests
    from sandbox_passes s where s.guest_id is not null and s.revoked_at is null and s.expires_at > now();
  if coalesce(array_length(guests, 1), 0) = 0 then
    return 0;
  end if;
  -- Guests are hidden from the colleagues in the product; answering needs them seen.
  update sandbox_passes set guest_id = null where id = any(pass_ids);

  -- Cover: the guest's own plans (not the seeded ones), asked more than 90 seconds ago.
  for r in
    select cr.id, cr.requested_profile_id as person, pl.profile_id as owner, pl.id as plan_id
      from coverage_requests cr
      join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
      join coverage_plans pl on pl.id = c.coverage_plan_id
     where cr.status = 'sent' and cr.interested_at is null and cr.sent_at < now() - interval '90 seconds'
       and pl.profile_id = any(guests) and not (cr.requested_profile_id = any(guests))
       and not exists (select 1 from private.demo_rows d where d.tbl = 'coverage_plans' and d.id = pl.id and d.owner = pl.profile_id)
       -- v5: one answer per client per minute, and at most two per client, so a plan asked of many colleagues stays calm.
       and (select count(*) from coverage_requests q2 where q2.coverage_plan_case_id = cr.coverage_plan_case_id and (q2.status in ('accepted', 'declined', 'discussing') or q2.interested_at is not null)) < 2
       and cr.id = (select min(q3.id) from coverage_requests q3 where q3.coverage_plan_case_id = cr.coverage_plan_case_id and q3.status = 'sent' and q3.interested_at is null and q3.sent_at < now() - interval '90 seconds')
     order by cr.id
  loop
    -- An earlier answer in this run may have settled it (parallel asks: one winner per client).
    perform 1 from coverage_requests q where q.id = r.id and q.status = 'sent';
    continue when not found;
    h := abs(hashtext('cover:' || r.id)) % 100;
    resp := case when h < 60 then 'accepted' when h < 80 then 'declined' else 'discussing' end;
    begin
      perform private.demo_as(r.person);
      perform public.cover_answer(r.id, resp,
        case when resp = 'discussing' then 'Could we talk this through briefly before I decide? I want to be sure I can give your client the time.' end,
        md5('auto-cover-' || r.id)::uuid);
      acted := acted + 1;
    exception when others then
      begin
        perform private.demo_as(r.person);
        perform public.cover_answer(r.id, 'declined', null, md5('auto-cover-decline-' || r.id)::uuid);
        acted := acted + 1;
      exception when others then
        raise warning 'demo_autorespond cover %: %', r.id, sqlerrm;
      end;
    end;
  end loop;

  -- Referrals: the guest's own referrals, each colleague asked more than 90 seconds ago.
  for r in
    select rc.referral_request_id as ref, rc.profile_id as person, rr.requesting_profile_id as owner
      from referral_recipients rc
      join referral_requests rr on rr.id = rc.referral_request_id
     where rr.requesting_profile_id = any(guests) and rr.status in ('open', 'sent', 'matched')
       and rc.sent_at < now() - interval '90 seconds' and not (rc.profile_id = any(guests))
       and not exists (select 1 from referral_responses x where x.referral_request_id = rc.referral_request_id and x.responding_profile_id = rc.profile_id)
       and not exists (select 1 from private.demo_rows d where d.tbl = 'referral_requests' and d.id = rr.id and d.owner = rr.requesting_profile_id)
       -- v5 (Nick, 8 Nov: far too many notifications): at most three colleagues answer each referral, one per minute.
       and (select count(*) from referral_responses x where x.referral_request_id = rc.referral_request_id) < 3
       and rc.profile_id = (select rc2.profile_id from referral_recipients rc2
                             where rc2.referral_request_id = rc.referral_request_id and rc2.sent_at < now() - interval '90 seconds'
                               and not exists (select 1 from referral_responses y where y.referral_request_id = rc2.referral_request_id and y.responding_profile_id = rc2.profile_id)
                             order by rc2.sent_at, rc2.profile_id limit 1)
     order by rc.referral_request_id, rc.profile_id
  loop
    h := abs(hashtext('ref:' || r.ref || ':' || r.person)) % 100;
    continue when h >= 80; -- some colleagues simply have not answered yet
    resp := case when h < 55 then 'interested' else 'declined' end;
    begin
      perform private.demo_as(r.person);
      perform public.referral_answer(r.ref, resp, resp = 'interested');
      acted := acted + 1;
    exception when others then
      begin
        perform private.demo_as(r.person);
        perform public.referral_answer(r.ref, 'declined', false);
        acted := acted + 1;
      exception when others then
        raise warning 'demo_autorespond referral %/%: %', r.ref, r.person, sqlerrm;
      end;
    end;
  end loop;

  -- Consult: the guest's own questions with no reply yet, asked more than 90 seconds ago.
  for r in
    select c.id, c.author_profile_id as owner, c.question from consultations c
     where c.author_profile_id = any(guests) and c.status = 'open' and c.created_at < now() - interval '90 seconds'
       and not exists (select 1 from consultation_responses x where x.consultation_id = c.id)
     order by c.id
  loop
    declare responder uuid; begin
      -- Who may see a question is decided for a signed-in viewer; the job has none, so look as the asker.
      perform private.demo_as(r.owner);
      select p.id into responder from profiles p
       where p.is_demo and not (p.id = any(guests)) and p.id <> r.owner and p.consultation_availability <> 'no'
         and p.verification_status = 'verified' and p.account_status = 'active'
         and private.consult_can_see(r.id, p.id)
       order by (p.consultation_availability = 'yes') desc, md5(r.id::text || p.id::text) limit 1;
      continue when responder is null;
      body := case
        when r.question ~* '(leave|cover|hand-?off|away|vacation|sabbatical|parental)' then 'For leave, I would agree the handover in writing first: who covers which clients, how urgent contacts reach them, and when the summary goes over. A short call before you go makes the transfer feel like continuity.'
        when r.question ~* '(refer|wait ?list)' then 'I would send two or three names that fit the client''s needs, insurance and location, and offer a short call with the colleague first. It makes the transfer feel like continuity rather than a goodbye.'
        when r.question ~* '(supervis|licensure|trainee)' then 'Happy to talk it through. I would agree the frequency, how cases are presented and how notes are kept before the first session.'
        when r.question ~* '(consent|telehealth|state|license|board)' then 'Check your state board''s current guidance first, then put it in your consent form in plain language. That covers most of the risk.'
        when r.question ~* '(record|subpoena|documentation|notes)' then 'Document the reasoning, not just the decision, and keep a copy of anything you release. For a subpoena, call your liability carrier before you respond.'
        when r.question ~* '(fee|billing|insurance|superbill|payment)' then 'Put it in your financial policy and go over it at intake. Clients rarely object to a rule they heard about up front.'
        else 'I would start by naming what has not worked and agreeing one small, concrete goal for the next three sessions. It keeps the conversation practical.'
      end;
      perform private.demo_as(responder);
      perform public.consult_reply(r.id, body, md5('auto-reply-' || r.id)::uuid);
      acted := acted + 1;
    exception when others then
      raise warning 'demo_autorespond consult %: %', r.id, sqlerrm;
    end;
  end loop;

  -- Messages: the guest's last message in a conversation, unanswered for 90 seconds.
  for r in
    select distinct on (m.conversation_id) m.conversation_id as conv, m.author_id as owner, m.id as msg
      from conversation_messages m
     where m.author_id = any(guests) and m.created_at < now() - interval '90 seconds' and m.created_at > now() - interval '1 day'
       and not exists (select 1 from conversation_messages y where y.conversation_id = m.conversation_id and y.created_at > m.created_at)
     order by m.conversation_id, m.created_at desc
  loop
    declare other uuid; begin
      select cp.profile_id into other from conversation_participants cp
       where cp.conversation_id = r.conv and cp.profile_id <> r.owner and not (cp.profile_id = any(guests)) limit 1;
      continue when other is null;
      perform private.demo_as(other);
      perform public.message_send('c-' || r.conv,
        (array['Thanks, that works for me. I will send a couple of times for a quick call.',
               'Thank you, Rachel. That is helpful, and I am glad to talk it through whenever suits you.',
               'Understood. Let me check my diary and come back to you shortly.'])[1 + abs(hashtext('msg:' || r.msg)) % 3],
        md5('auto-msg-' || r.msg)::uuid);
      acted := acted + 1;
    exception when others then
      raise warning 'demo_autorespond message %: %', r.msg, sqlerrm;
    end;
  end loop;

  perform private.demo_restore(null, null);
  update sandbox_passes s set guest_id = x.g from unnest(pass_ids, guests) as x(i, g) where s.id = x.i;

  -- Continuity: a backup or alternate the guest invites agrees after a minute.
  for r in
    select c.profile_id as owner, c.backup_profile_id as backup, c.alternate_profile_id as alternate, c.backup_status, c.alternate_status
    from continuity_plans c
    where private.is_sandbox_guest(c.profile_id) and c.updated_at < now() - interval '1 minute'
      and (c.backup_status = 'invited' or c.alternate_status = 'invited')
  loop
    perform set_config('pa.continuity_response', 'on', true);
    update continuity_plans set
      backup_status = case when backup_status = 'invited' then 'accepted' else backup_status end,
      backup_responded_at = case when backup_status = 'invited' then now() else backup_responded_at end,
      alternate_status = case when alternate_status = 'invited' then 'accepted' else alternate_status end,
      alternate_responded_at = case when alternate_status = 'invited' then now() else alternate_responded_at end
    where profile_id = r.owner;
    perform set_config('pa.continuity_response', '', true);
    if r.backup_status = 'invited' then
      perform private.notify_member(r.owner, r.backup, 'agreed to be the backup in your continuity plan', '/dashboard/continuity');
    end if;
    if r.alternate_status = 'invited' then
      perform private.notify_member(r.owner, r.alternate, 'agreed to be the alternate backup in your continuity plan', '/dashboard/continuity');
    end if;
    acted := acted + 1;
  end loop;

  return acted;
end;
$function$;

notify pgrst, 'reload schema';
