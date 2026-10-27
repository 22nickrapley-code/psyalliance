-- 0118: v13 workspace, part 2: Network, Consult, Library and preferences.
-- Builds on 0117. Nothing here changes who can see what: the rules that
-- already decide Consult audiences, trusted colleagues and Library access are
-- the ones used (and the existing guard triggers still run). New tables hold
-- only a member's own private choices. Safe to run more than once.
-- Run in both Supabase projects, after 0117.

-- 1. Small additions to existing tables --------------------------------------
-- The topic a question is filed under (Clinical practice, Professional life,
-- Resources, Community, Consultation); the request id makes a retried post
-- land once; the reply id does the same for replies.
alter table public.consultations add column if not exists topic text;
alter table public.consultations add column if not exists client_request_id uuid;
create unique index if not exists consultations_client_request_idx on public.consultations (author_profile_id, client_request_id) where client_request_id is not null;
alter table public.consultation_responses add column if not exists client_response_id uuid;
create unique index if not exists consultation_responses_client_idx on public.consultation_responses (responder_profile_id, client_response_id) where client_response_id is not null;
create index if not exists consultation_responses_by_consultation_idx on public.consultation_responses (consultation_id, created_at desc);

-- 2. A member's own private choices ----------------------------------------------
-- Following a discussion, marking a reply useful and saving a resource are
-- private to the member who does them: nobody else can read these rows, and
-- no count is ever shown to the person who wrote the reply.
create table if not exists public.consultation_follows (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  consultation_id bigint not null references public.consultations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, consultation_id)
);
create table if not exists public.consultation_response_useful (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response_id bigint not null references public.consultation_responses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, response_id)
);
create index if not exists consultation_response_useful_response_idx on public.consultation_response_useful (response_id);
create table if not exists public.saved_resources (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resource_key text not null check (resource_key ~ '^(PA-[0-9]{2}|guide:[1-6])$'),
  created_at timestamptz not null default now(),
  primary key (profile_id, resource_key)
);
do $$ declare t text; begin
  foreach t in array array['consultation_follows', 'consultation_response_useful', 'saved_resources'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    if not exists (select 1 from pg_policy where polrelid = ('public.' || t)::regclass and polname = 'see your own') then
      execute format('create policy "see your own" on public.%I for select to authenticated using (profile_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;

-- 3. Trusted colleagues ----------------------------------------------------------
-- Chosen one way, as before: no request, no acceptance. The colleague is told
-- once. The existing guard still checks both people are in the network, visible
-- to each other and not blocked.
create or replace function public.trust_set(p_colleague uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  added boolean := false;
  n integer;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_colleague is null or p_colleague = me then
    raise exception 'Choose a colleague.' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    if not exists (select 1 from private.visible_members(me) v where v.id = p_colleague) then
      raise exception 'You can''t add this member.' using errcode = 'P0001';
    end if;
    insert into trusted_colleagues (profile_id, colleague_id) values (me, p_colleague) on conflict do nothing;
    get diagnostics n = row_count;
    added := n > 0;
    if added and not exists (select 1 from notification_events e where e.dedup_key = 'trusted:' || me || ':' || p_colleague) then
      perform private.notify_member('trusted_invitation_sent', p_colleague, me, 'added you as a trusted colleague', '/dashboard/network?profile=' || me, 'trusted:' || me || ':' || p_colleague, '{}'::jsonb);
      perform private.professional_event('trusted_invitation_sent', me, p_colleague, 'added a trusted colleague', '{}'::jsonb);
    end if;
  else
    delete from trusted_colleagues where profile_id = me and colleague_id = p_colleague;
  end if;
  return jsonb_build_object('on', exists (select 1 from trusted_colleagues where profile_id = me and colleague_id = p_colleague), 'added', added);
end;
$function$;
revoke all on function public.trust_set(uuid, boolean) from public, anon;
grant execute on function public.trust_set(uuid, boolean) to authenticated;

-- 4. Notification preferences ----------------------------------------------------
-- Three switches on the screen, mapped onto the existing email settings:
--   messages  -> email_on_message
--   cover     -> coverage and referral requests and responses
--   community -> consultation replies and invitations, Town Hall replies
-- A switch reads as on if any of its settings is on (a member who set only
-- some in the older Settings page is not silently switched off), and setting
-- it writes all of them. Nothing else in the row is touched.
create or replace function public.workspace_preferences()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'messages', coalesce(p.email_on_message, true),
    'cover', coalesce(p.email_on_coverage_request or p.email_on_coverage_response or p.email_on_referral_request or p.email_on_referral_response, true),
    'community', coalesce(p.email_on_consultation_response or p.email_on_consultation_invite or p.email_on_town_hall_reply, true))
  from (select auth.uid() as id) me
  left join notification_preferences p on p.profile_id = me.id
  where me.id is not null;
$function$;
revoke all on function public.workspace_preferences() from public, anon;
grant execute on function public.workspace_preferences() to authenticated;

create or replace function public.set_workspace_preference(p_key text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  v boolean := coalesce(p_on, true);
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  insert into notification_preferences (profile_id) values (me) on conflict (profile_id) do nothing;
  if p_key = 'messages' then
    update notification_preferences set email_on_message = v, updated_at = now() where profile_id = me;
  elsif p_key = 'cover' then
    update notification_preferences set email_on_coverage_request = v, email_on_coverage_response = v, email_on_referral_request = v, email_on_referral_response = v, updated_at = now() where profile_id = me;
  elsif p_key = 'community' then
    update notification_preferences set email_on_consultation_response = v, email_on_consultation_invite = v, email_on_town_hall_reply = v, updated_at = now() where profile_id = me;
  else
    raise exception 'That setting can''t be changed here.' using errcode = 'P0001';
  end if;
  return public.workspace_preferences();
end;
$function$;
revoke all on function public.set_workspace_preference(text, boolean) from public, anon;
grant execute on function public.set_workspace_preference(text, boolean) to authenticated;

-- 5. Consult: who can see what ----------------------------------------------------
-- The same rule as the table's own read policy, for any viewer, so the
-- workspace's lists, the "people mentioned" list and replies all agree with it.
create or replace function private.consult_can_see(p_id bigint, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_viewer is not null and exists (
    select 1 from consultations c
     where c.id = p_id and c.status not in ('draft', 'removed')
       and (
         c.author_profile_id = p_viewer
         or (
           private.can_view_network(p_viewer)
           and private.in_viewer_partition(c.author_profile_id)
           and not public.is_blocked_between(p_viewer, c.author_profile_id)
           and (
             c.audience_type = 'wider_network'
             or (c.audience_type = 'selected' and p_viewer = any (c.audience_profile_ids))
             or (c.audience_type = 'trusted' and exists (select 1 from trusted_colleagues t where t.profile_id = c.author_profile_id and t.colleague_id = p_viewer))
             or (c.group_id is not null and private.is_consultation_group_member(c.group_id, p_viewer))
           )
         )
       )
  );
$function$;
revoke all on function private.consult_can_see(bigint, uuid) from public, anon, authenticated;

-- The 200 discussions with the most recent activity that the viewer can see.
create or replace function private.consult_recent(p_viewer uuid)
returns table (id bigint, ord bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select q.id, row_number() over (order by q.at desc, q.id desc)
    from (
      select c.id, greatest(c.created_at, coalesce((select max(r.created_at) from consultation_responses r where r.consultation_id = c.id), c.created_at)) as at
        from consultations c
       where p_viewer is not null and c.status in ('open', 'responses_received', 'resolved')
         and private.consult_can_see(c.id, p_viewer)
       order by 2 desc, 1 desc
       limit 200
    ) q;
$function$;
revoke all on function private.consult_recent(uuid) from public, anon, authenticated;

-- One discussion as the screens read it. Replies are newest first, the latest
-- 50 of them; replies from a colleague the viewer has blocked are left out.
create or replace function private.discussion_json(p_id bigint, p_viewer uuid)
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
               order by r.created_at desc, r.id desc limit 50) x), '[]'::jsonb))
  from consultations c where c.id = p_id;
$function$;
revoke all on function private.discussion_json(bigint, uuid) from public, anon, authenticated;

create or replace function public.workspace_discussions()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(private.discussion_json(r.id, auth.uid()) order by r.ord), '[]'::jsonb)
    from private.consult_recent(auth.uid()) r
   where auth.uid() is not null;
$function$;
revoke all on function public.workspace_discussions() from public, anon;
grant execute on function public.workspace_discussions() to authenticated;

-- One discussion in full (every reply), for when it is opened.
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
revoke all on function public.workspace_discussion(bigint) from public, anon;
grant execute on function public.workspace_discussion(bigint) to authenticated;

-- The member's own side of Consult: what they follow, what they marked useful,
-- the groups they belong to, and colleagues who have set consult to "Not now".
create or replace function public.workspace_groups()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'name', g.name,
           'purpose', coalesce(g.purpose, ''),
           'cadence', coalesce(g.cadence, ''),
           'minutes', g.meeting_length_minutes,
           'format', g.meeting_format,
           'charter', coalesce(g.charter_body, ''),
           'count', (select count(*) from consultation_group_members m where m.group_id = g.id and m.status = 'joined'),
           'members', coalesce((select jsonb_agg(m.profile_id order by m.invited_at, m.id)
                                  from consultation_group_members m
                                 where m.group_id = g.id and m.status = 'joined' and m.profile_id <> auth.uid()
                                   and m.profile_id in (select v.id from private.visible_members(auth.uid()) v)), '[]'::jsonb)
         ) order by g.created_at, g.id), '[]'::jsonb)
    from consultation_groups g
   where auth.uid() is not null
     and exists (select 1 from consultation_group_members m where m.group_id = g.id and m.profile_id = auth.uid() and m.status = 'joined');
$function$;
revoke all on function public.workspace_groups() from public, anon;
grant execute on function public.workspace_groups() to authenticated;

create or replace function public.workspace_consult()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'discussions', public.workspace_discussions(),
    'following', coalesce((select jsonb_agg(f.consultation_id order by f.created_at) from consultation_follows f
                            where f.profile_id = auth.uid() and private.consult_can_see(f.consultation_id, auth.uid())), '[]'::jsonb),
    'useful', coalesce((select jsonb_agg('r' || u.response_id order by u.created_at) from consultation_response_useful u
                         where u.profile_id = auth.uid()), '[]'::jsonb),
    'groups', public.workspace_groups(),
    'consultQuiet', coalesce((select jsonb_agg(p.id) from profiles p
                               where p.consultation_availability = 'no' and p.id in (select v.id from private.visible_members(auth.uid()) v)), '[]'::jsonb))
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_consult() from public, anon;
grant execute on function public.workspace_consult() to authenticated;

-- 6. Consult: asking, replying, following, useful ---------------------------------
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
    insert into consultations (author_profile_id, question, context, audience_type, audience_profile_ids, tags, topic, deidentification_confirmed, status, kind, group_id, client_request_id)
    values (me, v_title, nullif(v_body, ''), v_type, case when v_aud in ('one', 'few') then v_ids else '{}' end, v_tags, nullif(v_topic, ''), true, 'open', 'question', v_group, cid)
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
revoke all on function public.consult_reply(bigint, text, uuid) from public, anon;
grant execute on function public.consult_reply(bigint, text, uuid) to authenticated;

create or replace function public.consult_follow(p_consultation bigint, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    if not private.consult_can_see(p_consultation, me) then
      raise exception 'That discussion is not available.' using errcode = 'P0001';
    end if;
    insert into consultation_follows (profile_id, consultation_id) values (me, p_consultation) on conflict do nothing;
  else
    delete from consultation_follows where profile_id = me and consultation_id = p_consultation;
  end if;
  return jsonb_build_object('on', exists (select 1 from consultation_follows where profile_id = me and consultation_id = p_consultation));
end;
$function$;
revoke all on function public.consult_follow(bigint, boolean) from public, anon;
grant execute on function public.consult_follow(bigint, boolean) to authenticated;

-- "Useful" on someone else's reply: private to the member, never shown to the
-- person who wrote it. A colleague whose reply is marked useful joins
-- Suggested. If the member asked the question, the earlier author-only mark is
-- kept in step.
create or replace function public.consult_useful(p_response bigint, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  r record;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select x.id, x.consultation_id, x.responder_profile_id, c.author_profile_id into r
    from consultation_responses x join consultations c on c.id = x.consultation_id where x.id = p_response;
  if not found or not private.consult_can_see(r.consultation_id, me) then
    raise exception 'That reply is not available.' using errcode = 'P0001';
  end if;
  if r.responder_profile_id = me then
    raise exception 'You can mark a colleague''s reply useful.' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, r.responder_profile_id) then
    raise exception 'That reply is not available.' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    insert into consultation_response_useful (profile_id, response_id) values (me, p_response) on conflict do nothing;
  else
    delete from consultation_response_useful where profile_id = me and response_id = p_response;
  end if;
  if r.author_profile_id = me then
    update consultation_responses set marked_useful = coalesce(p_on, false) where id = p_response;
  end if;
  return jsonb_build_object('on', exists (select 1 from consultation_response_useful where profile_id = me and response_id = p_response));
end;
$function$;
revoke all on function public.consult_useful(bigint, boolean) from public, anon;
grant execute on function public.consult_useful(bigint, boolean) to authenticated;

-- 7. Library ----------------------------------------------------------------------
-- The templates a member can see (reviewed, or waiting for review) with their
-- review facts. Whether a waiting template is shown as ready is the app's
-- preview setting, exactly as before; nothing here marks anything reviewed.
create or replace function public.workspace_resources()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.library_code, 'title', d.title, 'summary', coalesce(d.summary, d.applicability, ''),
               'category', coalesce(d.category, ''), 'tags', to_jsonb(d.tags), 'version', d.version,
               'status', d.review_status, 'reviewDate', d.review_date, 'nextReviewDate', d.next_review_date,
               'contents', to_jsonb(coalesce(d.public_contents, '{}'::text[])), 'warning', coalesce(d.customization_warning, ''),
               'hasFile', coalesce(d.storage_path, '') <> '') order by d.library_code)
        from documents d
       where d.owner_scope = 'world' and d.library_code is not null
         and ((d.review_status = 'published' and d.review_date is not null) or d.review_status = 'provisional')), '[]'::jsonb),
    'saved', coalesce((select jsonb_agg(s.resource_key order by s.created_at) from saved_resources s where s.profile_id = auth.uid()), '[]'::jsonb))
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_resources() from public, anon;
grant execute on function public.workspace_resources() to authenticated;

create or replace function public.resource_save(p_key text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_key !~ '^(PA-[0-9]{2}|guide:[1-6])$' then
    raise exception 'That resource can''t be saved.' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    if p_key like 'PA-%' and not exists (select 1 from documents d where d.owner_scope = 'world' and d.library_code = p_key
                                         and ((d.review_status = 'published' and d.review_date is not null) or d.review_status = 'provisional')) then
      raise exception 'That resource isn''t available.' using errcode = 'P0001';
    end if;
    insert into saved_resources (profile_id, resource_key) values (me, p_key) on conflict do nothing;
  else
    delete from saved_resources where profile_id = me and resource_key = p_key;
  end if;
  return jsonb_build_object('on', exists (select 1 from saved_resources where profile_id = me and resource_key = p_key));
end;
$function$;
revoke all on function public.resource_save(text, boolean) from public, anon;
grant execute on function public.resource_save(text, boolean) to authenticated;

-- 8. Relationships that now include Consult ------------------------------------------
-- A colleague whose reply the member marked useful joins Suggested (after
-- PsyAlliance's own suggestions and hearted colleagues), exactly as a hearted
-- message does. Nothing here creates "worked with before".
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
    'workedReasons', coalesce((select jsonb_object_agg(colleague_id, reason) from worked), '{}'::jsonb)
  )
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_tiers() from public, anon;
grant execute on function public.workspace_tiers() to authenticated;

-- People the screens mention who are not in the member's directory now. Adds
-- the people in Consult discussions and groups the member can see.
create or replace function public.workspace_known()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select auth.uid() as id),
  refs as (
    select p.profile_id as id from coverage_plans p, me
     where p.status <> 'draft' and (p.profile_id = me.id or exists (
       select 1 from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id
        where c.coverage_plan_id = p.id and r.requested_profile_id = me.id))
    union
    select r.requested_profile_id from coverage_requests r
      join coverage_plan_cases c on c.id = r.coverage_plan_case_id
      join coverage_plans p on p.id = c.coverage_plan_id, me
     where p.profile_id = me.id
    union
    select unnest(c.outreach_queue) from coverage_plan_cases c
      join coverage_plans p on p.id = c.coverage_plan_id, me
     where p.profile_id = me.id
    union
    select c.assigned_clinician_id from coverage_plan_cases c
      join coverage_plans p on p.id = c.coverage_plan_id, me
     where p.profile_id = me.id and c.assigned_clinician_id is not null
    union
    select rq.requesting_profile_id from referral_requests rq join referral_recipients rc on rc.referral_request_id = rq.id, me
     where rc.profile_id = me.id
    union
    select rc.profile_id from referral_recipients rc join referral_requests rq on rq.id = rc.referral_request_id, me
     where rq.requesting_profile_id = me.id
    union
    select o.profile_id from conversation_participants mine
      join conversation_participants o on o.conversation_id = mine.conversation_id and o.profile_id <> mine.profile_id, me
     where mine.profile_id = me.id
    union
    select c.author_profile_id from consultations c join private.consult_recent((select id from me)) rc on rc.id = c.id
    union
    select x.responder_profile_id from consultation_responses x join private.consult_recent((select id from me)) rc on rc.id = x.consultation_id
    union
    select m.profile_id from consultation_group_members m, me
     where m.status = 'joined' and m.profile_id is not null
       and m.group_id in (select m2.group_id from consultation_group_members m2 where m2.profile_id = me.id and m2.status = 'joined')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id, 'name', private.member_name(pr.id), 'initials', private.initials(pr.full_name),
    'credential', coalesce(pr.qualification_level::text, ''), 'role', private.role_label(pr.qualification_level::text),
    'state', '', 'city', '', 'licenses', '{}'::jsonb, 'specialties', '[]'::jsonb, 'slots', 0, 'confirmedAt', null,
    'languages', '[]'::jsonb, 'ages', '[]'::jsonb, 'insurance', '[]'::jsonb, 'modalities', '[]'::jsonb, 'sessionTypes', '[]'::jsonb,
    'psypact', false, 'bio', '', 'avatarPath', null, 'limited', true)), '[]'::jsonb)
  from refs join profiles pr on pr.id = refs.id, me
  where me.id is not null and refs.id <> me.id
    and refs.id not in (select vm.id from private.visible_members(me.id) vm);
$function$;
revoke all on function public.workspace_known() from public, anon;
grant execute on function public.workspace_known() to authenticated;

-- 9. Slices and boot (stays last) ---------------------------------------------------
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
revoke all on function public.workspace_slice(text[]) from public, anon;
grant execute on function public.workspace_slice(text[]) to authenticated;

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
revoke all on function public.workspace_boot() from public, anon;
grant execute on function public.workspace_boot() to authenticated;
