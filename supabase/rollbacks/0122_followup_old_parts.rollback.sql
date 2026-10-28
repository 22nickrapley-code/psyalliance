-- Rollback for 0122_followup_old_parts.sql
-- Puts back the previous version of every function 0122 changed, and removes the two it added.
-- Safe to run once, in the same project(s) where 0122 was run. It changes no data and no tables.
-- (0122 added no tables or columns; availability "selected referrals only" is stored inside the existing availability record and is simply ignored by the old functions.)
begin;

drop function if exists public.workspace_year();
drop function if exists public.workspace_profile_signals(uuid);
drop function if exists public.set_my_availability(boolean, integer, jsonb, date, text, text, text);
drop function if exists public.consult_reply(bigint, text, uuid, text);

-- private.thread_json (as of 0117_v13_workspace.sql)
create or replace function private.thread_json(p_conv bigint, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c conversations%rowtype;
  other uuid;
  last_read timestamptz;
  ty text;
  msgs jsonb;
  total integer;
  unread integer;
  changed timestamptz;
begin
  select * into c from conversations where id = p_conv;
  select greatest(max(edited_at), max(deleted_at)) into changed from conversation_messages where conversation_id = p_conv;
  select profile_id into other from conversation_participants where conversation_id = p_conv and profile_id <> p_viewer limit 1;
  select cp.last_read_at into last_read from conversation_participants cp where cp.conversation_id = p_conv and cp.profile_id = p_viewer;
  ty := case when c.context_key like 'cover-%' then 'Cover' when c.context_key like 'referral-%' then 'Referral'
             when c.context_key like 'consult-%' then 'Consult' when c.context_key like 'direct-%' then 'Direct'
             when coalesce(c.title, '') ~* '^cover' then 'Cover' when coalesce(c.title, '') ~* '^referral' then 'Referral' else 'Direct' end;
  select count(*) into total from conversation_messages where conversation_id = p_conv and deleted_at is null;
  select count(*) into unread from conversation_messages m
   where m.conversation_id = p_conv and m.deleted_at is null and m.author_id <> p_viewer and m.created_at > last_read;
  select coalesce(jsonb_agg(x.j order by x.at, x.k), '[]'::jsonb) into msgs
    from (
      select m.created_at as at, m.id as k,
             jsonb_strip_nulls(jsonb_build_object(
               'id', coalesce(m.client_message_id::text, 'm' || m.id),
               'dbId', m.id,
               'text', m.body,
               'own', m.author_id = p_viewer,
               'createdAt', m.created_at,
               'edited', m.edited_at is not null,
               'request', case when c.context_key is not null and m.client_message_id = md5(c.context_key || ':request')::uuid then true end,
               'reaction', case when exists (select 1 from message_reactions r where r.message_id = m.id and r.profile_id = p_viewer and r.reaction = 'heart') then '♥' end,
               'audio', case when a.kind = 'audio' then jsonb_build_object(
                           'duration', (a.duration_seconds / 60) || ':' || lpad((a.duration_seconds % 60)::text, 2, '0'),
                           'url', '/dashboard/message-files/' || m.id) end,
               'attachment', case when a.kind = 'file' then jsonb_build_object(
                           'name', a.file_name,
                           'size', case when a.file_size < 1048576 then ceil(a.file_size / 1024.0)::integer || ' KB' else round(a.file_size / 1048576.0, 1) || ' MB' end,
                           'url', '/dashboard/message-files/' || m.id) end)) as j
        from conversation_messages m
        left join message_attachments a on a.message_id = m.id
       where m.conversation_id = p_conv and m.deleted_at is null
       order by m.created_at desc, m.id desc
       limit 200
    ) x;
  return jsonb_build_object(
    'id', coalesce(c.context_key, 'c-' || c.id),
    'convId', c.id,
    'person', other,
    'context', coalesce(nullif(c.title, ''), 'Direct conversation'),
    'type', ty,
    'coverId', nullif(substring(c.context_key from '^cover-([0-9]+)-'), '')::bigint,
    'clientId', nullif(substring(c.context_key from '^cover-[0-9]+-([0-9]+)-'), '')::bigint,
    'referralId', nullif(substring(c.context_key from '^referral-([0-9]+)-'), '')::bigint,
    'unread', unread,
    'activityAt', c.last_message_at,
    'more', total > 200,
    'pulse', jsonb_build_object('activityAt', c.last_message_at, 'count', total, 'changedAt', changed, 'unread', unread),
    'messages', msgs);
end;
$function$;

-- public.workspace_threads (as of 0117_v13_workspace.sql)
create or replace function public.workspace_threads()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(private.thread_json(v.id, auth.uid()) order by v.last_message_at desc, v.id desc), '[]'::jsonb)
    from (
      select c.id, c.last_message_at
        from conversations c
        join conversation_participants mp on mp.conversation_id = c.id and mp.profile_id = auth.uid()
       where auth.uid() is not null
         and (select count(*) from conversation_participants x where x.conversation_id = c.id) = 2
         and not public.is_blocked_between(auth.uid(), (select x.profile_id from conversation_participants x where x.conversation_id = c.id and x.profile_id <> auth.uid() limit 1))
    ) v;
$function$;

-- public.workspace_pulse (as of 0117_v13_workspace.sql)
create or replace function public.workspace_pulse()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(coalesce(v.context_key, 'c-' || v.id), jsonb_build_object(
           'activityAt', v.last_message_at,
           'count', v.n,
           'changedAt', v.changed,
           'unread', v.unread)), '{}'::jsonb)
    from (
      select c.id, c.context_key, c.last_message_at,
             (select count(*) from conversation_messages m where m.conversation_id = c.id and m.deleted_at is null) as n,
             (select greatest(max(m.edited_at), max(m.deleted_at)) from conversation_messages m where m.conversation_id = c.id) as changed,
             (select count(*) from conversation_messages m where m.conversation_id = c.id and m.deleted_at is null and m.author_id <> auth.uid() and m.created_at > mp.last_read_at) as unread
        from conversations c
        join conversation_participants mp on mp.conversation_id = c.id and mp.profile_id = auth.uid()
       where auth.uid() is not null
         and (select count(*) from conversation_participants x where x.conversation_id = c.id) = 2
         and not public.is_blocked_between(auth.uid(), (select x.profile_id from conversation_participants x where x.conversation_id = c.id and x.profile_id <> auth.uid() limit 1))
    ) v;
$function$;

-- public.workspace_thread (as of 0117_v13_workspace.sql)
create or replace function public.workspace_thread(p_key text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select private.thread_json(c, auth.uid())
    from (select private.thread_conversation(p_key, auth.uid()) as c) t
   where t.c is not null
     and not public.is_blocked_between(auth.uid(), (select x.profile_id from conversation_participants x where x.conversation_id = t.c and x.profile_id <> auth.uid() limit 1));
$function$;

-- public.workspace_tiers (as of 0120_final_product.sql)
create or replace function public.workspace_tiers()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vm as (select id from private.visible_members(auth.uid())),
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
     where s.profile_id = auth.uid() and s.colleague_id in (select id from vm)
       and s.colleague_id not in (select colleague_id from trusted) and s.colleague_id not in (select colleague_id from worked)
    union all
    select l.colleague_id, 1, -extract(epoch from l.at)
      from liked l
     where l.colleague_id in (select id from vm)
       and l.colleague_id not in (select colleague_id from trusted) and l.colleague_id not in (select colleague_id from worked)
       and l.colleague_id not in (select s2.colleague_id from suggested_colleagues s2 where s2.profile_id = auth.uid())
  )
  select jsonb_build_object(
    'trust', coalesce((select jsonb_agg(colleague_id order by created_at) from (select t2.colleague_id, t2.created_at from trusted_colleagues t2 where t2.profile_id = auth.uid() and t2.colleague_id in (select id from vm)) q), '[]'::jsonb),
    'worked', coalesce((select jsonb_agg(colleague_id order by at desc) from worked), '[]'::jsonb),
    'suggested', coalesce((select jsonb_agg(colleague_id order by grp, ord) from suggested), '[]'::jsonb),
    'workedReasons', coalesce((select jsonb_object_agg(colleague_id, reason) from worked), '{}'::jsonb),
    -- Colleagues who invited this member (D-12): the screens say so on their Suggested card.
    'invitedBy', coalesce((select jsonb_agg(u.inviter) from member_invite_uses u where u.invitee = auth.uid() and u.connected_at is not null and u.inviter in (select id from vm)), '[]'::jsonb)
  )
  where auth.uid() is not null;
$function$;

-- public.workspace_people (as of 0120_final_product.sql)
create or replace function public.workspace_people()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vm as (select * from private.visible_members(auth.uid())),
  facts as (
    select v.profile_id,
      array_agg(lv.value order by v.rank nulls last, lv.value) filter (where lv.category = 'treatment_specialism') focus,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'insurance') insurance,
      array_agg(lv.value order by lv.id) filter (where lv.category = 'age_group_specialism') ages,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'language') languages,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'treatment_modality') modalities,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'session_type') sessions
    from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
    where v.profile_id in (select id from vm)
    group by v.profile_id
  ),
  lic as (
    select s.profile_id, jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state) licenses
      from private.member_state_settings s
     where s.profile_id in (select id from vm)
     group by s.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', regexp_replace(p.full_name, '^(dr\.?)\s+', '', 'i'),
    'initials', private.initials(p.full_name),
    'credential', coalesce(p.qualification_level::text, ''),
    'role', private.role_label(p.qualification_level::text),
    'state', coalesce(upper(trim(p.primary_state)), ''),
    'city', coalesce(p.primary_practice_city, ''),
    'licenses', coalesce(lic.licenses, '{}'::jsonb),
    'specialties', to_jsonb(coalesce(f.focus, '{}'::text[])),
    'slots', case when p.referral_availability = 'no' or (p.availability_paused_until is not null and p.availability_paused_until >= current_date) then 0 else coalesce(p.approx_spaces, 0) end,
    'confirmedAt', p.availability_confirmed_at,
    'languages', to_jsonb(coalesce(f.languages, '{}'::text[])),
    'ages', to_jsonb(coalesce(f.ages, '{}'::text[])),
    'insurance', to_jsonb(coalesce(f.insurance, '{}'::text[])),
    'modalities', to_jsonb(coalesce(f.modalities, '{}'::text[])),
    'sessionTypes', to_jsonb(coalesce(f.sessions, '{}'::text[])),
    'psypact', p.psypact_participating,
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'yes' then 'yes' when 'ask_me' then 'ask' when 'no' then 'no' end,
    'consult', p.consultation_availability is distinct from 'no',
    'bio', coalesce(p.bio, ''),
    'avatarPath', p.avatar_path
  ) order by p.full_name), '[]'::jsonb)
  from vm join profiles p on p.id = vm.id
  left join facts f on f.profile_id = p.id
  left join lic on lic.profile_id = p.id
  where auth.uid() is not null;
$function$;

-- public.my_availability (as of 0120_final_product.sql)
create or replace function public.my_availability()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'open', p.referral_availability in ('yes', 'limited'),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'ask_me' then 'ask' when 'no' then 'no' else 'yes' end,
    'consult', p.consultation_availability is distinct from 'no',
    'states', coalesce((
      select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
        from private.member_state_settings s where s.profile_id = p.id
    ), '{}'::jsonb))
  from public.profiles p where p.id = auth.uid();
$function$;

-- public.set_my_availability (as of 0120_final_product.sql)
create or replace function public.set_my_availability(
  p_open boolean, p_spaces integer, p_states jsonb,
  p_paused_until date default null, p_cover text default null, p_consult text default null)
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
  cur text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can set availability.' using errcode = 'P0001';
  end if;
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
  if p_open and p_spaces > 0 and not any_setting then
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
         referral_availability = case when p_open then (case when cur = 'limited' then 'limited' else 'yes' end) else 'no' end,
         availability_paused_until = p_paused_until,
         accepting_referrals = p_open and p_paused_until is null,
         coverage_availability = case p_cover when 'yes' then 'yes' when 'ask' then 'ask_me' when 'no' then 'no' else coverage_availability end,
         consultation_availability = case p_consult when 'yes' then 'yes' when 'no' then 'no' else consultation_availability end,
         availability_confirmed_at = now()
   where id = me;
  return public.my_availability();
end;
$function$;

-- public.workspace_boot (as of 0118_v13_network_consult_library.sql)
create or replace function public.workspace_boot()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return null;
  end if;
  if not exists (select 1 from profiles where id = me) then
    return jsonb_build_object('gate', 'no_profile');
  end if;
  if exists (select 1 from profiles where id = me and account_kind = 'operator') then
    return jsonb_build_object('gate', 'operator');
  end if;
  if not private.is_network_member(me) then
    return jsonb_build_object('gate', 'waiting');
  end if;
  return jsonb_build_object('gate', 'ok', 'serverNow', now(), 'options', public.workspace_options())
         || public.workspace_slice(array['me', 'people', 'known', 'tiers', 'availability', 'drafts', 'plans', 'referrals', 'threads', 'inbound', 'consult', 'resources', 'preferences']);
end;
$function$;

-- public.workspace_slice (as of 0118_v13_network_consult_library.sql)
create or replace function public.workspace_slice(p_names text[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r jsonb := '{}'::jsonb;
  n text;
begin
  if auth.uid() is null then
    return null;
  end if;
  foreach n in array coalesce(p_names, '{}'::text[]) loop
    r := r || case n
      when 'me' then jsonb_build_object('me', public.workspace_me())
      when 'people' then jsonb_build_object('people', public.workspace_people())
      when 'tiers' then jsonb_build_object('tiers', public.workspace_tiers())
      when 'availability' then jsonb_build_object('availability', public.my_availability())
      when 'drafts' then jsonb_build_object('drafts', public.workspace_drafts_slice())
      when 'plans' then jsonb_build_object('plans', public.workspace_plans())
      when 'known' then jsonb_build_object('known', public.workspace_known())
      when 'referrals' then jsonb_build_object('referrals', public.workspace_referrals())
      when 'threads' then jsonb_build_object('threads', public.workspace_threads())
      when 'pulse' then jsonb_build_object('pulse', public.workspace_pulse())
      when 'inbound' then jsonb_build_object('inbound', public.workspace_inbound())
      when 'consult' then public.workspace_consult()
      when 'resources' then public.workspace_resources()
      when 'preferences' then jsonb_build_object('preferences', public.workspace_preferences())
      else '{}'::jsonb
    end;
  end loop;
  return r;
end;
$function$;

-- public.consult_reply (as of 0118_v13_network_consult_library.sql)
create or replace function public.consult_reply(p_consultation bigint, p_body text, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_author uuid;
  v_new bigint;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  if p_client_id is not null then
    select r.id into v_new from consultation_responses r where r.responder_profile_id = me and r.client_response_id = p_client_id;
    if found then
      return jsonb_build_object('id', 'r' || v_new, 'existing', true);
    end if;
  end if;
  if v_body = '' then
    raise exception 'Write a reply first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 3000 then
    raise exception 'That reply is a little long. Shorten it.' using errcode = 'P0001';
  end if;
  if not private.consult_can_see(p_consultation, me) then
    raise exception 'That discussion is not available.' using errcode = 'P0001';
  end if;
  select c.author_profile_id into v_author from consultations c where c.id = p_consultation;
  if public.is_blocked_between(me, v_author) then
    raise exception 'That discussion is not available.' using errcode = 'P0001';
  end if;
  begin
    insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, client_response_id)
    values (p_consultation, me, 'reply', v_body, p_client_id) returning id into v_new;
  exception when unique_violation then
    select r.id into v_new from consultation_responses r where r.responder_profile_id = me and r.client_response_id = p_client_id;
    return jsonb_build_object('id', 'r' || v_new, 'existing', true);
  end;
  update consultations set status = 'responses_received' where id = p_consultation and status = 'open';
  insert into consultation_follows (profile_id, consultation_id) values (me, p_consultation) on conflict do nothing;
  perform private.professional_event('consultation_response', me, null, 'replied to a consultation', jsonb_build_object('consultationId', p_consultation));
  -- The person who asked is told (with email, by their own switch); others who
  -- follow it see it in their notifications without an email.
  perform private.notify_member('consultation_response', v_author, me, 'replied to your consultation', '/dashboard/consult?discussion=' || p_consultation, 'consult-reply:' || p_consultation || ':' || me, jsonb_build_object('consultationId', p_consultation));
  perform private.notify_member('consultation_response', f.profile_id, me, 'replied to a discussion you follow', '/dashboard/consult?discussion=' || p_consultation, 'consult-follow:' || p_consultation || ':' || me, jsonb_build_object('consultationId', p_consultation), false)
    from consultation_follows f
   where f.consultation_id = p_consultation and f.profile_id not in (me, v_author)
     and private.consult_can_see(p_consultation, f.profile_id);
  return jsonb_build_object('id', 'r' || v_new, 'existing', false);
end;
$function$;

-- private.discussion_json (as of 0118_v13_network_consult_library.sql)
create or replace function private.discussion_json(p_id bigint, p_viewer uuid, p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', c.id,
    'person', case when c.author_profile_id = p_viewer then 'me' else c.author_profile_id::text end,
    'title', c.question,
    'text', coalesce(c.context, ''),
    'tag', coalesce(nullif(c.topic, ''), 'Consultation'),
    'tags', to_jsonb(array[coalesce(nullif(c.topic, ''), 'Consultation')] || coalesce(c.tags, '{}'::text[])),
    'audience', case when c.group_id is not null then 'group'
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
               'createdAt', x.created_at) order by x.created_at desc, x.id desc)
        from (select r.* from consultation_responses r
               where r.consultation_id = c.id and not public.is_blocked_between(p_viewer, r.responder_profile_id)
               order by r.created_at desc, r.id desc limit p_limit) x), '[]'::jsonb))
  from consultations c where c.id = p_id;
$function$;

-- public.workspace_discussion (as of 0118_v13_network_consult_library.sql)
create or replace function public.workspace_discussion(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  d jsonb;
begin
  if me is null or not private.consult_can_see(p_id, me) then
    return null;
  end if;
  d := private.discussion_json(p_id, me);
  d := jsonb_set(d, '{history}', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', 'r' || r.id,
             'person', case when r.responder_profile_id = me then 'me' else r.responder_profile_id::text end,
             'text', r.body,
             'createdAt', r.created_at) order by r.created_at desc, r.id desc)
      from consultation_responses r
     where r.consultation_id = p_id and not public.is_blocked_between(me, r.responder_profile_id)), '[]'::jsonb));
  return d;
end;
$function$;

revoke all on function public.set_my_availability(boolean, integer, jsonb, date, text, text) from public, anon;
grant execute on function public.set_my_availability(boolean, integer, jsonb, date, text, text) to authenticated;
revoke all on function public.consult_reply(bigint, text, uuid) from public, anon;
grant execute on function public.consult_reply(bigint, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
