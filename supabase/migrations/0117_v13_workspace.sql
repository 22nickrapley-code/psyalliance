-- Version 13 workspace (The Hub, Cover, Referrals, Consult, Network / Search,
-- Messages, Library). Additive and safe to run twice. Runs on both projects.
-- Nothing here changes or removes an existing record, ID or permission.
--
--   1. Availability: one overall number of spaces, per-state settings, the
--      90-day rule (confirmed through day 90, stale from day 91).
--   2. Relationships: the four tiers as the workspace reads them.
--   3. People and "me" read models.
--   4. Choice lists the screens offer.
--   5. Drafts and per-member screen state.
--   6. Cover: plans, clients, requests, deadlines, handover, history.
--   7. Referrals: who was asked, replies with capacity, placement, withdrawal.
--   8. Colleagues the screens mention who are no longer in the directory.
--   9. Slices and the boot snapshot.
--
-- Later sections (Messages, Consult, Invitations, Library) are appended below
-- as they are added.

-- 1. Availability ---------------------------------------------------------------
create table if not exists public.profile_state_settings (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null check (state ~ '^[A-Z]{2}$'),
  virtual boolean not null default false,
  in_person boolean not null default false,
  city text,
  updated_at timestamptz not null default now(),
  primary key (profile_id, state),
  constraint profile_state_settings_city_check check (not in_person or length(trim(coalesce(city, ''))) > 0)
);
alter table public.profile_state_settings enable row level security;
revoke all on public.profile_state_settings from anon, authenticated;
grant select on public.profile_state_settings to authenticated;
drop policy if exists "members read their own state settings" on public.profile_state_settings;
create policy "members read their own state settings" on public.profile_state_settings
  for select to authenticated using (profile_id = (select auth.uid()));

-- One rule for "is this confirmation current": through day 90, stale from day 91.
create or replace function public.availability_is_fresh(p_confirmed timestamptz)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select p_confirmed is not null and now() - p_confirmed < interval '91 days';
$function$;
grant execute on function public.availability_is_fresh(timestamptz) to anon, authenticated;

-- A member's reviewed, current licences with the settings for each state.
-- A state they have not set yet follows their profile: virtual unless the
-- profile lists only Face to Face; in person only in their primary state
-- when the profile lists Face to Face and a practice city. They confirm or
-- change these on the new Availability screen.
create or replace view private.member_state_settings as
with lic as (
  select distinct l.profile_id, upper(trim(l.state)) as state
    from public.licenses l
   where l.status = 'active' and l.reviewed_at is not null
     and (l.expiration_date is null or l.expiration_date >= current_date)
), sess as (
  select v.profile_id,
         coalesce(bool_or(lv.value = 'Virtual'), false) as virtual,
         coalesce(bool_or(lv.value = 'Face to Face'), false) as face
    from public.profile_lookup_values v
    join public.lookup_values lv on lv.id = v.lookup_value_id and lv.category = 'session_type'
   group by v.profile_id
)
select lic.profile_id,
       lic.state,
       coalesce(s.virtual, coalesce(x.virtual, false) or not coalesce(x.face, false)) as virtual,
       coalesce(s.in_person, coalesce(x.face, false) and lic.state = upper(trim(p.primary_state)) and nullif(trim(p.primary_practice_city), '') is not null, false) as in_person,
       coalesce(s.city, case when coalesce(x.face, false) and lic.state = upper(trim(p.primary_state)) then nullif(trim(p.primary_practice_city), '') end) as city
  from lic
  join public.profiles p on p.id = lic.profile_id
  left join sess x on x.profile_id = lic.profile_id
  left join public.profile_state_settings s on s.profile_id = lic.profile_id and s.state = lic.state;
revoke all on private.member_state_settings from public, anon, authenticated;

-- Search and "available now" use the same rule everywhere.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.network_directory(jsonb)'::regprocedure);
  if strpos(d, 'pr.availability_confirmed_at >= now() - interval ''30 days''') > 0 then
    execute replace(d, 'pr.availability_confirmed_at >= now() - interval ''30 days''', 'public.availability_is_fresh(pr.availability_confirmed_at)');
  end if;
end $$;

-- The member's own availability as the workspace shows it.
create or replace function public.my_availability()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'open', p.referral_availability in ('yes', 'limited') and (p.availability_paused_until is null or p.availability_paused_until < current_date),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'pausedUntil', p.availability_paused_until,
    'states', coalesce((
      select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
        from private.member_state_settings s where s.profile_id = p.id
    ), '{}'::jsonb))
  from public.profiles p where p.id = auth.uid();
$function$;
revoke all on function public.my_availability() from public, anon;
grant execute on function public.my_availability() to authenticated;

-- Save and confirm: one overall number, settings per licensed state.
-- p_states is {"NY": {"virtual": true, "inPerson": false, "city": ""}, ...}
create or replace function public.set_my_availability(p_open boolean, p_spaces integer, p_states jsonb)
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
         accepting_referrals = p_open and not (availability_paused_until is not null and availability_paused_until >= current_date),
         availability_confirmed_at = now()
   where id = me;
  return public.my_availability();
end;
$function$;
revoke all on function public.set_my_availability(boolean, integer, jsonb) from public, anon;
grant execute on function public.set_my_availability(boolean, integer, jsonb) to authenticated;

-- "Confirm unchanged": only the confirmation time moves.
create or replace function public.confirm_my_availability()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can confirm availability.' using errcode = 'P0001';
  end if;
  update profiles set availability_confirmed_at = now() where id = me;
  return public.my_availability();
end;
$function$;
revoke all on function public.confirm_my_availability() from public, anon;
grant execute on function public.confirm_my_availability() to authenticated;

-- 2. Relationships ---------------------------------------------------------------
-- Worked with before, as the workspace reads it: agreed cover, a confirmed
-- referral placement, or a completed arrangement recorded in the history.
-- Messages, reactions and consult replies alone never create it.
create or replace function private.workspace_worked(p_viewer uuid)
returns table (colleague_id uuid, reason text, at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cover as (
    select case when pl.profile_id = p_viewer then r.requested_profile_id else pl.profile_id end as colleague_id,
           'cover'::text as kind, coalesce(r.responded_at, r.sent_at) as at, pl.title, pl.starts_on, pl.ends_on, (pl.profile_id = p_viewer) as mine
      from coverage_requests r
      join coverage_plan_cases c on c.id = r.coverage_plan_case_id
      join coverage_plans pl on pl.id = c.coverage_plan_id
     where r.status = 'accepted' and (pl.profile_id = p_viewer or r.requested_profile_id = p_viewer)
  ), placed as (
    select case when rq.requesting_profile_id = p_viewer then rr.responding_profile_id else rq.requesting_profile_id end as colleague_id,
           'referral'::text as kind, coalesce(rr.responded_at, rr.created_at) as at, null::text as title, null::date as starts_on, null::date as ends_on,
           (rq.requesting_profile_id = p_viewer) as mine
      from referral_responses rr
      join referral_requests rq on rq.id = rr.referral_request_id
     where rr.status = 'accepted' and (rq.requesting_profile_id = p_viewer or rr.responding_profile_id = p_viewer)
  ), events as (
    select case when e.actor_profile_id = p_viewer then e.related_profile_id else e.actor_profile_id end as colleague_id,
           'event'::text as kind, e.created_at as at, e.summary as title, null::date as starts_on, null::date as ends_on, false as mine
      from professional_events e
     where e.event_type in ('coverage_completed', 'referral_outcome', 'collaboration_established', 'reciprocal_coverage_established')
       and (e.actor_profile_id = p_viewer or e.related_profile_id = p_viewer)
       and e.actor_profile_id is not null and e.related_profile_id is not null
  ), all_rows as (
    select * from cover union all select * from placed union all select * from events
  )
  select a.colleague_id,
         (array_agg(a.kind order by a.at desc))[1],
         max(a.at)
    from all_rows a
   where a.colleague_id is not null and a.colleague_id <> p_viewer
   group by a.colleague_id;
$function$;
revoke all on function private.workspace_worked(uuid) from public, anon, authenticated;

-- 3. People ----------------------------------------------------------------------
create or replace function private.initials(p_name text)
returns text
language sql
immutable
as $function$
  select upper(coalesce(left(a[1], 1), '') || case when array_length(a, 1) > 1 then left(a[array_length(a, 1)], 1) else '' end)
    from (select regexp_split_to_array(trim(regexp_replace(coalesce(p_name, ''), '^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+', '', 'i')), '\s+') as a) s;
$function$;

create or replace function private.role_label(p_qualification text)
returns text
language sql
immutable
as $function$
  select case when p_qualification in ('MD', 'DO') then 'Psychiatrist' else 'Clinical psychologist' end;
$function$;

-- Everyone the member can see in the network, as the workspace needs them.
-- Same visibility rules as the existing directory: verified, active,
-- reviewed licence, not blocked, same demo partition.
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
    'bio', coalesce(p.bio, ''),
    'avatarPath', p.avatar_path
  ) order by p.full_name), '[]'::jsonb)
  from vm join profiles p on p.id = vm.id
  left join facts f on f.profile_id = p.id
  left join lic on lic.profile_id = p.id
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;

-- The signed-in member as the workspace's own record.
create or replace function public.workspace_me()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', 'me',
    'profileId', p.id,
    'name', regexp_replace(p.full_name, '^(dr\.?)\s+', '', 'i'),
    'initials', private.initials(p.full_name),
    'credential', coalesce(p.qualification_level::text, ''),
    'role', private.role_label(p.qualification_level::text),
    'state', coalesce(upper(trim(p.primary_state)), ''),
    'city', coalesce(p.primary_practice_city, ''),
    'licenses', coalesce((select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
                            from private.member_state_settings s where s.profile_id = p.id), '{}'::jsonb),
    'specialties', coalesce((select jsonb_agg(lv.value order by v.rank nulls last, lv.value)
                               from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
                              where v.profile_id = p.id and lv.category = 'treatment_specialism'), '[]'::jsonb),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'avatarPath', p.avatar_path,
    'isAdmin', p.is_admin
  )
  from profiles p where p.id = auth.uid();
$function$;
revoke all on function public.workspace_me() from public, anon;
grant execute on function public.workspace_me() to authenticated;

-- The four tiers for the signed-in member, as lists of colleague IDs.
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
  suggested as (select s.colleague_id, s.position from suggested_colleagues s
                 where s.profile_id = auth.uid() and s.colleague_id in (select id from vm)
                   and s.colleague_id not in (select colleague_id from trusted) and s.colleague_id not in (select colleague_id from worked))
  select jsonb_build_object(
    'trust', coalesce((select jsonb_agg(colleague_id order by created_at) from (select t2.colleague_id, t2.created_at from trusted_colleagues t2 where t2.profile_id = auth.uid() and t2.colleague_id in (select id from vm)) q), '[]'::jsonb),
    'worked', coalesce((select jsonb_agg(colleague_id order by at desc) from worked), '[]'::jsonb),
    'suggested', coalesce((select jsonb_agg(colleague_id order by position) from suggested), '[]'::jsonb),
    'workedReasons', coalesce((select jsonb_object_agg(colleague_id, reason) from worked), '{}'::jsonb)
  )
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_tiers() from public, anon;
grant execute on function public.workspace_tiers() to authenticated;

-- Backfill: nothing to copy. Settings are read through private.member_state_settings,
-- which falls back to each member's profile until they save the new screen.

-- 4. Choice lists --------------------------------------------------------------
-- The controlled vocabulary the screens offer, from the product's own lists
-- (so what a member can pick is exactly what colleagues' profiles carry).
create or replace function public.workspace_options()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'focus', (select coalesce(jsonb_agg(value order by value), '[]') from lookup_values where category = 'treatment_specialism'),
    'insurance', (select coalesce(jsonb_agg(value order by case when value in ('Other', 'Self-pay (out of network)') then 1 else 0 end, value), '[]') from lookup_values where category = 'insurance'),
    'language', (select coalesce(jsonb_agg(value order by case when value = 'English' then 0 else 1 end, value), '[]') from lookup_values where category = 'language'),
    'age', (select coalesce(jsonb_agg(value order by case value when 'Children' then 1 when 'Adolescents' then 2 when 'Young Adults' then 3 when 'Adults' then 4 when 'Seniors' then 5 else 9 end), '[]') from lookup_values where category = 'age_group_specialism'),
    'modality', (select coalesce(jsonb_agg(value order by value), '[]') from lookup_values where category = 'treatment_modality')
  );
$function$;
revoke all on function public.workspace_options() from public, anon;
grant execute on function public.workspace_options() to authenticated;

-- 5. Drafts and per-member screen state ----------------------------------------------
-- One place for what a member has started but not sent, kept for their own
-- account by the exact workflow or conversation it belongs to: a cover plan,
-- a referral, a question, an availability edit, an invitation, a message to
-- one conversation. Only the owner reads or writes a row.
create table if not exists public.workspace_drafts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (length(kind) between 1 and 40),
  key text not null default '' check (length(key) <= 80),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, kind, key)
);
alter table public.workspace_drafts enable row level security;
revoke all on public.workspace_drafts from anon, authenticated;
grant select on public.workspace_drafts to authenticated;
drop policy if exists "members read their own drafts" on public.workspace_drafts;
create policy "members read their own drafts" on public.workspace_drafts
  for select to authenticated using (profile_id = (select auth.uid()));

create or replace function public.save_workspace_draft(p_kind text, p_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_data is null or p_data = 'null'::jsonb or p_data = '{}'::jsonb or p_data = '[]'::jsonb then
    delete from workspace_drafts where profile_id = me and kind = p_kind and key = coalesce(p_key, '');
    return;
  end if;
  if pg_column_size(p_data) > 400000 then
    raise exception 'That draft is too large to keep.' using errcode = 'P0001';
  end if;
  insert into workspace_drafts (profile_id, kind, key, data, updated_at)
  values (me, p_kind, coalesce(p_key, ''), p_data, now())
  on conflict (profile_id, kind, key) do update set data = excluded.data, updated_at = now();
end;
$function$;
revoke all on function public.save_workspace_draft(text, text, jsonb) from public, anon;
grant execute on function public.save_workspace_draft(text, text, jsonb) to authenticated;

create or replace function public.workspace_drafts_slice()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(kind, items), '{}'::jsonb)
    from (select d.kind, jsonb_object_agg(d.key, d.data) items
            from workspace_drafts d where d.profile_id = auth.uid() group by d.kind) q;
$function$;
revoke all on function public.workspace_drafts_slice() from public, anon;
grant execute on function public.workspace_drafts_slice() to authenticated;

-- 6. Cover ------------------------------------------------------------------------
-- The cover plan as the workspace runs it: one plan, several clients, each
-- client asked of one colleague at a time (or several at once), a reply
-- deadline on every open request, a pause while a colleague is discussing,
-- "agreed" kept apart from "handover ready", and a record of every step.
-- Everything the screens change goes through the functions below, so a
-- retry, a second tab or a slow connection can never send a request twice or
-- skip a check.

-- 6a. Conversation identity and idempotent messages (Messages builds on these).
-- A conversation about one thing (a client on a cover plan, a referral, a pair
-- of colleagues) has one key, whoever opens it.
alter table public.conversations add column if not exists context_key text;
create unique index if not exists conversations_context_key_idx on public.conversations (context_key) where context_key is not null;
alter table public.conversation_messages add column if not exists client_message_id uuid;
create unique index if not exists conversation_messages_client_id_idx on public.conversation_messages (author_id, client_message_id) where client_message_id is not null;

create or replace function private.context_conversation(p_key text, p_title text, p_participants uuid[], p_creator uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v bigint;
begin
  select id into v from conversations where context_key = p_key;
  if v is null then
    insert into conversations (created_by, title, context_key) values (p_creator, p_title, p_key)
    on conflict (context_key) where context_key is not null do nothing
    returning id into v;
    if v is null then
      select id into v from conversations where context_key = p_key;
    end if;
  end if;
  insert into conversation_participants (conversation_id, profile_id)
  select v, x from unnest(p_participants) x
  on conflict do nothing;
  return v;
end;
$function$;
revoke all on function private.context_conversation(text, text, uuid[], uuid) from public, anon, authenticated;

-- One notification in the same transaction as the change that caused it: the
-- in-app item now, the email queued (each member's switches apply when it is
-- sent). The same key never tells the same person twice within a day.
create or replace function private.notify_member(p_type text, p_recipient uuid, p_actor uuid, p_summary text, p_link text, p_dedup text, p_meta jsonb, p_email boolean default true, p_email_after interval default '0 seconds')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare ev bigint;
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then
    return;
  end if;
  if p_dedup is not null and exists (
    select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id
     where e.dedup_key = p_dedup and d.recipient_profile_id = p_recipient and d.status in ('pending', 'sent')
       and d.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;
  insert into notification_events (event_type, actor_profile_id, actor_type, dedup_key, deep_link, summary, metadata)
  values (p_type, p_actor, case when p_actor is null then 'system' else 'member_web' end::public.actor_type, p_dedup, p_link, p_summary, coalesce(p_meta, '{}'::jsonb))
  returning id into ev;
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at, send_after)
  values (ev, p_recipient, 'in_app', 'sent', now(), now());
  if p_email then
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, send_after)
    values (ev, p_recipient, 'email', 'pending', now() + p_email_after);
  end if;
end;
$function$;
revoke all on function private.notify_member(text, uuid, uuid, text, text, text, jsonb, boolean, interval) from public, anon, authenticated;

create or replace function private.professional_event(p_type text, p_actor uuid, p_related uuid, p_summary text, p_meta jsonb, p_seconds integer default null)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, metadata, response_time_seconds)
  values (p_type, p_actor, 'member_web', p_related, p_summary, coalesce(p_meta, '{}'::jsonb), p_seconds);
$function$;
revoke all on function private.professional_event(text, uuid, uuid, text, jsonb, integer) from public, anon, authenticated;

-- A message in a conversation: once per client message id, whatever the
-- connection does. The author has read up to it; the others are told.
create or replace function private.post_message(p_conv bigint, p_author uuid, p_body text, p_client_id uuid, p_link text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v bigint; o record;
begin
  if p_client_id is not null then
    select id into v from conversation_messages where author_id = p_author and client_message_id = p_client_id;
    if found then
      return v;
    end if;
  end if;
  insert into conversation_messages (conversation_id, author_id, body, client_message_id)
  values (p_conv, p_author, p_body, p_client_id)
  returning id into v;
  update conversations set last_message_at = now() where id = p_conv;
  update conversation_participants set last_read_at = now() where conversation_id = p_conv and profile_id = p_author;
  for o in select profile_id from conversation_participants where conversation_id = p_conv and profile_id <> p_author loop
    perform private.notify_member('message_received', o.profile_id, p_author, 'sent you a message', coalesce(p_link, '/dashboard/messages'),
                                  'message:' || p_conv, jsonb_build_object('conversationId', p_conv), true, interval '60 minutes');
  end loop;
  return v;
end;
$function$;
revoke all on function private.post_message(bigint, uuid, text, uuid, text) from public, anon, authenticated;

-- 6b. What a plan, a client and a request now carry.
alter table public.coverage_plans
  add column if not exists reason text,
  add column if not exists reason_note text,
  add column if not exists response_hours integer not null default 48,
  add column if not exists client_request_id uuid;
alter table public.coverage_plans drop constraint if exists coverage_plans_response_hours_check;
alter table public.coverage_plans add constraint coverage_plans_response_hours_check check (response_hours in (6, 12, 24, 48, 72, 168));
alter table public.coverage_plans drop constraint if exists coverage_plans_reason_check;
alter table public.coverage_plans add constraint coverage_plans_reason_check check (reason is null or reason in ('short', 'extended', 'unexpected', 'closing', 'reciprocal', 'other'));
alter table public.coverage_plans drop constraint if exists coverage_plans_absence_type_check;
alter table public.coverage_plans add constraint coverage_plans_absence_type_check check (absence_type = any (array['short_planned', 'extended_leave', 'unexpected', 'closing_practice', 'reciprocal', 'other']));
create unique index if not exists coverage_plans_client_request_idx on public.coverage_plans (profile_id, client_request_id) where client_request_id is not null;

alter table public.coverage_plan_cases
  add column if not exists language text,
  add column if not exists city text,
  add column if not exists via_hub boolean not null default false,
  add column if not exists handover_confirmed_at timestamptz,
  add column if not exists handover_confirmed_by uuid references public.profiles(id) on delete set null;

alter table public.coverage_requests
  add column if not exists expires_at timestamptz,
  add column if not exists closed_reason text;
alter table public.coverage_requests drop constraint if exists coverage_requests_closed_reason_check;
alter table public.coverage_requests add constraint coverage_requests_closed_reason_check check (closed_reason is null or closed_reason in ('deadline', 'competing', 'plan_ended'));
create index if not exists coverage_requests_deadline_idx on public.coverage_requests (expires_at) where status = 'sent' and expires_at is not null;

-- The record of every step. Read only through the workspace's own function,
-- which shows each person only what concerns them.
create table if not exists public.coverage_plan_events (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.coverage_plans(id) on delete cascade,
  case_id bigint references public.coverage_plan_cases(id) on delete cascade,
  subject_profile_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists coverage_plan_events_plan_idx on public.coverage_plan_events (plan_id, created_at desc);
alter table public.coverage_plan_events enable row level security;
revoke all on public.coverage_plan_events from anon, authenticated;

create or replace function private.cover_event(p_plan bigint, p_case bigint, p_subject uuid, p_kind text, p_meta jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into coverage_plan_events (plan_id, case_id, subject_profile_id, kind, meta) values (p_plan, p_case, p_subject, p_kind, coalesce(p_meta, '{}'::jsonb));
$function$;
revoke all on function private.cover_event(bigint, bigint, uuid, text, jsonb) from public, anon, authenticated;

-- 6c. Deadlines and the pause while someone is discussing.
-- An open request ("sent") carries the time its reply is due, counted from
-- when that colleague was asked (so in a sequence the clock starts when their
-- turn comes). Anything else carries none: a colleague who is discussing has
-- paused the sequence, and it stays paused until they answer.
create or replace function private.cover_set_expiry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare hrs integer;
begin
  if new.status = 'sent' then
    if new.expires_at is null and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
      select pl.response_hours into hrs
        from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
       where c.id = new.coverage_plan_case_id;
      -- Plans made before deadlines existed have no clock; the Hub's own do.
      if exists (select 1 from coverage_plan_cases c where c.id = new.coverage_plan_case_id and c.via_hub) then
        new.expires_at := coalesce(new.sent_at, now()) + make_interval(hours => coalesce(hrs, 48));
      end if;
    end if;
  else
    new.expires_at := null;
  end if;
  return new;
end;
$function$;
drop trigger if exists cover_set_expiry on public.coverage_requests;
create trigger cover_set_expiry before insert or update of status on public.coverage_requests
  for each row execute function private.cover_set_expiry();

-- Who a case still needs, as the workspace's rules read it. (Mirrors the
-- screens' own check, so what a member sees is what the server enforces.)
create or replace function private.cover_exclusions(
  p_candidate uuid, p_state text, p_setting text, p_prescribing boolean,
  p_focus text, p_secondary text, p_age text, p_insurance text, p_language text, p_city text)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cand as (
    select p.id, private.role_label(p.qualification_level::text) as role, lower(coalesce(p.primary_practice_city, '')) as city
      from profiles p where p.id = p_candidate
  ), lic as (
    select * from private.member_state_settings s where s.profile_id = p_candidate and s.state = upper(coalesce(p_state, ''))
  ), f as (
    select coalesce(array_agg(lv.value) filter (where lv.category = 'treatment_specialism'), '{}') spec,
           coalesce(array_agg(lv.value) filter (where lv.category = 'age_group_specialism'), '{}') ages,
           coalesce(array_agg(lv.value) filter (where lv.category = 'insurance'), '{}') ins,
           coalesce(array_agg(lv.value) filter (where lv.category = 'language'), '{}') langs
      from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
     where v.profile_id = p_candidate
  )
  select case when not exists (select 1 from cand) then array['Not a colleague you can ask']
  else array_remove(array[
    case when not exists (select 1 from lic) then 'No reviewed ' || upper(coalesce(p_state, '')) || ' license'
         when (p_setting = 'virtual' and not (select virtual from lic))
           or (p_setting = 'in_person' and not (select in_person from lic))
           or (p_setting = 'either' and not (select virtual from lic) and not (select in_person from lic))
         then (case p_setting when 'virtual' then 'Virtual' when 'in_person' then 'In person' else 'Virtual or in person' end) || ' setting unavailable' end,
    case when coalesce(p_prescribing, false) and (select role from cand) <> 'Psychiatrist' then 'Prescribing required' end,
    case when nullif(p_focus, '') is not null and not ((select spec from f) @> array[p_focus]) then p_focus || ' not listed' end,
    case when nullif(p_secondary, '') is not null and not ((select spec from f) @> array[p_secondary]) then p_secondary || ' not listed' end,
    case when nullif(p_age, '') is not null and not ((select ages from f) @> array[p_age]) then p_age || ' not supported' end,
    case when nullif(p_insurance, '') is not null and not ((select ins from f) @> array[p_insurance]) then 'Insurance does not match' end,
    case when nullif(p_language, '') is not null and not ((select langs from f) @> array[p_language]) then p_language || ' not listed' end,
    case when nullif(p_city, '') is not null and p_setting = 'in_person'
          and position(lower(p_city) in (select city from cand)) = 0
          and position(lower(p_city) in lower(coalesce((select l.city from lic l), ''))) = 0
         then 'In-person city does not match' end
  ], null) end;
$function$;
revoke all on function private.cover_exclusions(uuid, text, text, boolean, text, text, text, text, text, text) from public, anon, authenticated;

-- The same check for a client already on a plan.
create or replace function private.cover_case_exclusions(p_case bigint, p_candidate uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select private.cover_exclusions(
    p_candidate,
    coalesce(c.jurisdiction_state, pl.jurisdiction_state),
    coalesce(c.modality, 'either'),
    c.prescribing_needed,
    (select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[1]),
    case when c.via_hub then (select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[2]) end,
    c.age_band, c.insurance, c.language, c.city)
  from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
  where c.id = p_case;
$function$;
revoke all on function private.cover_case_exclusions(bigint, uuid) from public, anon, authenticated;

-- Next colleague in the sequence, on a decline or a missed deadline. Checked
-- again now: someone whose license has lapsed since the plan was made is
-- passed over (and the plan's history says so), never asked.
create or replace function public.advance_cover_outreach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_case coverage_plan_cases%rowtype;
  v_plan coverage_plans%rowtype;
  v_next uuid;
  v_skipped uuid[] := '{}';
  v_request_id bigint;
  c record;
begin
  if new.status not in ('declined', 'expired') or old.status = new.status then
    return new;
  end if;
  -- Closed because someone else took the client or the plan ended: nothing to advance.
  if new.status = 'expired' and coalesce(new.closed_reason, 'deadline') <> 'deadline' then
    return new;
  end if;

  select * into v_case from coverage_plan_cases where id = new.coverage_plan_case_id for update;
  if not found or coalesce(array_length(v_case.outreach_queue, 1), 0) = 0 then
    return new;
  end if;
  select * into v_plan from coverage_plans where id = v_case.coverage_plan_id;
  if v_plan.status <> 'active' then
    return new;
  end if;

  -- Only when nobody is still being asked, discussing, or has agreed.
  if exists (
    select 1 from coverage_requests r
     where r.coverage_plan_case_id = v_case.id and r.id <> new.id and r.status in ('sent', 'discussing', 'accepted')
  ) then
    return new;
  end if;

  for c in
    select t.q as person, t.ord
      from unnest(v_case.outreach_queue) with ordinality as t(q, ord)
     where not exists (select 1 from coverage_requests r where r.coverage_plan_case_id = v_case.id and r.requested_profile_id = t.q)
       and not exists (select 1 from coverage_case_rejections x where x.coverage_plan_case_id = v_case.id and x.candidate_profile_id = t.q)
     order by t.ord
  loop
    if not exists (select 1 from private.visible_members(v_plan.profile_id) vm where vm.id = c.person)
       or array_length(private.cover_case_exclusions(v_case.id, c.person), 1) is not null then
      v_skipped := v_skipped || c.person;
      perform private.cover_event(v_plan.id, v_case.id, c.person, 'skipped', '{}'::jsonb);
      continue;
    end if;
    begin
      insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, message)
      values (v_case.id, c.person, (select coalesce(max(sequence_order), 0) + 1 from coverage_requests where coverage_plan_case_id = v_case.id), new.message)
      returning id into v_request_id;
      v_next := c.person;
      exit;
    exception when others then
      v_skipped := v_skipped || c.person;
      perform private.cover_event(v_plan.id, v_case.id, c.person, 'skipped', '{}'::jsonb);
    end;
  end loop;

  update coverage_plan_cases
     set outreach_queue = array(
           select t.q from unnest(v_case.outreach_queue) with ordinality as t(q, ord)
            where (v_next is null or t.q <> v_next) and not (t.q = any (v_skipped))
              and not exists (select 1 from coverage_requests r where r.coverage_plan_case_id = v_case.id and r.requested_profile_id = t.q)
            order by t.ord)
   where id = v_case.id;

  if v_next is null then
    return new;
  end if;

  update coverage_plan_cases set status = 'awaiting_response' where id = v_case.id;
  perform private.professional_event('coverage_request_sent', v_plan.profile_id, v_next, 'sent a coverage request',
                                     jsonb_build_object('coveragePlanCaseId', v_case.id, 'coverageRequestId', v_request_id));
  perform private.notify_member('coverage_request', v_next, v_plan.profile_id, 'sent you a coverage request',
                                '/dashboard/cover?plan=' || v_plan.id, 'coverage_request:' || v_request_id,
                                jsonb_build_object('coveragePlanCaseId', v_case.id, 'coverageRequestId', v_request_id));
  return new;
end;
$function$;

-- Someone agreed: the others' requests close as "taken", not as "missed".
create or replace function public.settle_cover_siblings()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update coverage_requests
       set status = 'expired', closed_reason = 'competing', responded_at = coalesce(responded_at, now())
     where coverage_plan_case_id = new.coverage_plan_case_id
       and id <> new.id
       and status in ('sent', 'discussing');
  end if;
  return new;
end;
$function$;

-- The step log, written wherever a request changes (a member's answer, the
-- deadline job, the next colleague being asked), so every path leaves the
-- same record.
create or replace function private.cover_log_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    when 'declined' then 'declined'
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
revoke all on function private.cover_log_request() from public, anon, authenticated;
drop trigger if exists cover_log_request on public.coverage_requests;
create trigger cover_log_request after insert or update of status on public.coverage_requests
  for each row execute function private.cover_log_request();

-- The deadline job. Every minute: any open request past its time closes as
-- missed, and the trigger asks the next colleague in a sequence. Safe to run
-- twice, at any moment, and for a plan that has since ended (those are left).
create or replace function private.cover_process_deadlines()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  return n;
end;
$function$;
revoke all on function private.cover_process_deadlines() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobname) from cron.job where jobname = 'pa_cover_deadlines';
    perform cron.schedule('pa_cover_deadlines', '* * * * *', 'select private.cover_process_deadlines()');
  end if;
end $$;

-- 6d. Plans: create, answer, ask another colleague, confirm handover, complete, cancel.
create or replace function private.member_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select regexp_replace(coalesce(full_name, 'A colleague'), '^(dr\.?)\s+', '', 'i') from profiles where id = p_id;
$function$;
revoke all on function private.member_name(uuid) from public, anon, authenticated;

create or replace function private.count_word(p_n integer)
returns text
language sql
immutable
as $function$
  select coalesce((array['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'])[p_n + 1], p_n::text);
$function$;

-- Create the plan, its clients and the first requests in one step. Safe to
-- send twice with the same requestId: the plan already made is returned and
-- nobody is asked again. Every recipient is checked again here, against the
-- client's own needs, at the moment of sending.
create or replace function public.cover_create_plan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
          (case when reason = 'closing' then 'refer_out' end)::coverage_plan_track,
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
revoke all on function public.cover_create_plan(jsonb) from public, anon;
grant execute on function public.cover_create_plan(jsonb) to authenticated;

-- A colleague's answer to one request. Accepting takes the client for good
-- (the others close as "taken"); a question puts the request in discussion,
-- which pauses the sequence, and is delivered in that request's own
-- conversation.
create or replace function public.cover_answer(p_request bigint, p_response text, p_question text default null, p_client_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if p_response not in ('accepted', 'declined', 'discussing') then
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
    conv := private.context_conversation(ckey, pl.title || ' · ' || cs.case_reference, array[pl.profile_id, me], me);
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
                                  case p_response when 'accepted' then 'confirmed they can cover your client'
                                                  when 'discussing' then 'asked a question about your coverage request'
                                                  else 'responded "declined" to your coverage request' end,
                                  '/dashboard/cover?plan=' || pl.id, 'coverage_response:' || p_request || ':' || p_response,
                                  jsonb_build_object('coverageRequestId', p_request, 'response', p_response));
  end if;
  return jsonb_build_object('status', p_response, 'unchanged', not changed, 'conversationKey', ckey, 'messageId', msg);
end;
$function$;
revoke all on function public.cover_answer(bigint, text, text, uuid) from public, anon;
grant execute on function public.cover_answer(bigint, text, text, uuid) to authenticated;

-- "Find another colleague": the organiser asks one more colleague about a
-- client that has not been taken.
create or replace function public.cover_ask(p_plan bigint, p_case bigint, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  cs coverage_plan_cases%rowtype;
  excl text[];
  rid bigint;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
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
  if p_person is null or p_person = me then
    raise exception 'Choose a colleague.' using errcode = 'P0001';
  end if;
  if exists (select 1 from coverage_requests r where r.coverage_plan_case_id = cs.id and r.requested_profile_id = p_person and r.status in ('sent', 'discussing')) then
    return jsonb_build_object('unchanged', true);
  end if;
  if (select count(*) from coverage_requests r where r.coverage_plan_case_id = cs.id) >= 20 then
    raise exception 'You have already asked 20 colleagues about this client.' using errcode = 'P0001';
  end if;
  excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = p_person)
               then private.cover_case_exclusions(cs.id, p_person)
               else array['Not a colleague you can ask'] end;
  if array_length(excl, 1) is not null then
    raise exception '% can''t be asked about %: %.', private.member_name(p_person), cs.case_reference, excl[1] using errcode = 'P0001';
  end if;
  perform set_config('pa.cover_retry', 'on', true);
  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, message)
  values (cs.id, p_person, (select coalesce(max(sequence_order), 0) + 1 from coverage_requests where coverage_plan_case_id = cs.id), nullif(pl.notes, ''))
  returning id into rid;
  perform set_config('pa.cover_retry', 'off', true);
  update coverage_plan_cases
     set status = 'awaiting_response', outreach_queue = array_remove(coalesce(outreach_queue, '{}'), p_person)
   where id = cs.id;
  perform private.professional_event('coverage_request_sent', me, p_person, 'sent a coverage request',
                                     jsonb_build_object('coveragePlanCaseId', cs.id, 'coverageRequestId', rid));
  perform private.notify_member('coverage_request', p_person, me, 'sent you a coverage request',
                                '/dashboard/cover?plan=' || pl.id, 'coverage_request:' || rid,
                                jsonb_build_object('coveragePlanCaseId', cs.id, 'coverageRequestId', rid));
  return jsonb_build_object('unchanged', false, 'requestId', rid);
end;
$function$;
revoke all on function public.cover_ask(bigint, bigint, uuid) from public, anon;
grant execute on function public.cover_ask(bigint, bigint, uuid) to authenticated;

-- Handover ready: only the organiser, only after a colleague has agreed, and
-- only with all three confirmations.
create or replace function public.cover_confirm_handover(p_plan bigint, p_case bigint, p_contact boolean, p_summary boolean, p_client boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  cs coverage_plan_cases%rowtype;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
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
  if cs.assigned_clinician_id is null then
    raise exception 'A colleague needs to agree before the handover can be confirmed.' using errcode = 'P0001';
  end if;
  if not (coalesce(p_contact, false) and coalesce(p_summary, false) and coalesce(p_client, false)) then
    raise exception 'Confirm all three handover points.' using errcode = 'P0001';
  end if;
  if cs.handover_confirmed_at is not null then
    return jsonb_build_object('unchanged', true);
  end if;
  update coverage_plan_cases set handover_confirmed_at = now(), handover_confirmed_by = me where id = cs.id;
  perform private.cover_event(pl.id, cs.id, cs.assigned_clinician_id, 'handover_ready', '{}'::jsonb);
  perform private.notify_member('coverage_confirmed', cs.assigned_clinician_id, me, 'confirmed the handover arrangements',
                                '/dashboard/cover?plan=' || pl.id, 'cover_handover:' || cs.id, jsonb_build_object('coveragePlanCaseId', cs.id));
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.cover_confirm_handover(bigint, bigint, boolean, boolean, boolean) from public, anon;
grant execute on function public.cover_confirm_handover(bigint, bigint, boolean, boolean, boolean) to authenticated;

create or replace function public.cover_complete_plan(p_plan bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  a uuid;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into pl from coverage_plans where id = p_plan and profile_id = me for update;
  if not found then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if pl.status = 'completed' then
    return jsonb_build_object('unchanged', true);
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from coverage_plan_cases where coverage_plan_id = pl.id)
     or exists (select 1 from coverage_plan_cases c where c.coverage_plan_id = pl.id and (c.assigned_clinician_id is null or c.handover_confirmed_at is null)) then
    raise exception 'Confirm every handover before completing.' using errcode = 'P0001';
  end if;
  update coverage_plans set status = 'completed', completed_at = now() where id = pl.id;
  perform private.cover_event(pl.id, null, null, 'completed');
  for a in select distinct assigned_clinician_id from coverage_plan_cases where coverage_plan_id = pl.id loop
    perform private.professional_event('coverage_completed', me, a, 'completed a cover arrangement', jsonb_build_object('coveragePlanId', pl.id));
    perform private.notify_member('coverage_confirmed', a, me, 'completed the cover arrangement',
                                  '/dashboard/cover?plan=' || pl.id, 'cover_complete:' || pl.id, jsonb_build_object('coveragePlanId', pl.id));
  end loop;
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.cover_complete_plan(bigint) from public, anon;
grant execute on function public.cover_complete_plan(bigint) to authenticated;

create or replace function public.cover_cancel_plan(p_plan bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  a uuid;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into pl from coverage_plans where id = p_plan and profile_id = me for update;
  if not found then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if pl.status = 'cancelled' then
    return jsonb_build_object('unchanged', true);
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended.' using errcode = 'P0001';
  end if;
  update coverage_plans set status = 'cancelled' where id = pl.id;
  perform private.cover_event(pl.id, null, null, 'cancelled');
  -- Open requests close; answers and handover records stay.
  for a in
    select distinct x from (
      select r.requested_profile_id x from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id
       where c.coverage_plan_id = pl.id and r.status in ('sent', 'discussing')
      union
      select c.assigned_clinician_id from coverage_plan_cases c where c.coverage_plan_id = pl.id and c.assigned_clinician_id is not null) q
     where x is not null
  loop
    perform private.notify_member('coverage_response', a, me, 'cancelled the cover plan', '/dashboard/cover?plan=' || pl.id,
                                  'cover_cancel:' || pl.id, jsonb_build_object('coveragePlanId', pl.id));
  end loop;
  update coverage_requests set status = 'expired', closed_reason = 'plan_ended', responded_at = coalesce(responded_at, now())
   where status in ('sent', 'discussing')
     and coverage_plan_case_id in (select id from coverage_plan_cases where coverage_plan_id = pl.id);
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.cover_cancel_plan(bigint) from public, anon;
grant execute on function public.cover_cancel_plan(bigint) to authenticated;

-- 6e. What the workspace reads.
-- The wording of one step in the plan's history, for the person reading it.
create or replace function private.cover_event_text(p_kind text, p_owner_view boolean, p_label text, p_owner_first text, p_subject text, p_meta jsonb)
returns text
language sql
immutable
as $function$
  select case when p_owner_view then
    case p_kind
      when 'created' then 'Plan created with ' || private.count_word(coalesce((p_meta ->> 'clients')::integer, 0)) || ' anonymous client need' || case when coalesce((p_meta ->> 'clients')::integer, 0) = 1 then '' else 's' end || '.'
      when 'invited' then case when p_meta ->> 'mode' = 'parallel' then 'Parallel' else 'Sequential' end || ' invitations sent. Response deadline: ' || coalesce(p_meta ->> 'hours', '48') || ' hours.'
      when 'asked' then case when coalesce((p_meta ->> 'retry')::boolean, false) then p_label || ': a new request was sent to ' || p_subject || '.' else p_label || ': ' || p_subject || ' asked next.' end
      when 'declined' then p_label || ': ' || p_subject || ' declined.'
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
      when 'declined' then 'You declined ' || p_label || '.'
      when 'discussing' then 'You asked to discuss ' || p_label || '.'
      when 'accepted' then 'You agreed to cover ' || p_label || '.'
      when 'expired' then 'The reply deadline for ' || p_label || ' passed.'
      when 'closed_competing' then p_label || ' is now covered by another colleague.'
      when 'handover_ready' then p_owner_first || ' confirmed the handover arrangements.'
      when 'completed' then 'Arrangement completed. All handovers were confirmed.'
      when 'cancelled' then 'Plan cancelled. Outstanding invitations closed.'
      else null end
  end;
$function$;

create or replace function private.cover_history(p_plan bigint, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  pl coverage_plans%rowtype;
  own boolean;
  first_name text;
  res jsonb;
begin
  select * into pl from coverage_plans where id = p_plan;
  own := pl.profile_id = p_viewer;
  first_name := split_part(private.member_name(pl.profile_id), ' ', 1);
  select coalesce(jsonb_agg(jsonb_build_object('at', q.at, 'text', q.t) order by q.at desc, q.id desc), '[]'::jsonb) into res
    from (
      select e.id, e.created_at as at,
             private.cover_event_text(e.kind, own, coalesce(c.case_reference, ''), first_name,
                                      coalesce(private.member_name(e.subject_profile_id), ''), e.meta) as t
        from coverage_plan_events e
        left join coverage_plan_cases c on c.id = e.case_id
       where e.plan_id = p_plan
         and (own or e.subject_profile_id = p_viewer or e.kind in ('completed', 'cancelled'))
    ) q
   where q.t is not null;
  if own and res = '[]'::jsonb then
    res := jsonb_build_array(jsonb_build_object('at', pl.created_at, 'text', 'Plan created.'));
  end if;
  return res;
end;
$function$;
revoke all on function private.cover_history(bigint, uuid) from public, anon, authenticated;

create or replace function private.cover_plan_json(p_plan bigint, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
                 'status', case r.status::text when 'sent' then 'awaiting'
                                               when 'expired' then case when r.closed_reason = 'deadline' then 'expired' else 'closed' end
                                               else r.status::text end,
                 'order', r.sequence_order, 'sentAt', r.sent_at, 'expiresAt', r.expires_at, 'respondedAt', r.responded_at) as j
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
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'discussing') then 'discussing'
      when own and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'sent') then 'awaiting'
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
    'history', private.cover_history(pl.id, p_viewer),
    'clients', clients);
end;
$function$;
revoke all on function private.cover_plan_json(bigint, uuid) from public, anon, authenticated;

-- Your plans, and the plans you have been asked to help with. A colleague
-- sees only their own requests and the clients those are about, never who
-- else was asked or who took a client.
create or replace function public.workspace_plans()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(private.cover_plan_json(p.id, auth.uid()) order by p.created_at desc, p.id desc), '[]'::jsonb)
    from coverage_plans p
   where auth.uid() is not null
     and p.status <> 'draft'
     and (p.profile_id = auth.uid()
          or (exists (select 1 from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id
                       where c.coverage_plan_id = p.id and r.requested_profile_id = auth.uid())
              and not public.is_blocked_between(auth.uid(), p.profile_id)));
$function$;
revoke all on function public.workspace_plans() from public, anon;
grant execute on function public.workspace_plans() to authenticated;


-- 7. Referrals --------------------------------------------------------------------
-- A referral as the workspace runs it: one client need, asked of chosen
-- colleagues (or of a trusted circle or the verified network, matched to the
-- need), each of whom can say they are interested (with their current
-- capacity confirmed for this referral), ask a question first, or decline.
-- Interest is an offer to talk: a placement exists only when the referrer
-- chooses one interested colleague, and that choice closes the rest. Every
-- change goes through the functions below, so a retry, a second tab or a slow
-- connection can never send a referral twice, place it twice or skip a check.

-- 7a. What a referral and a reply now carry.
alter table public.referral_requests
  add column if not exists prescribing boolean not null default false,
  add column if not exists client_request_id uuid,
  add column if not exists withdrawn_at timestamptz;
create unique index if not exists referral_requests_client_request_idx
  on public.referral_requests (requesting_profile_id, client_request_id) where client_request_id is not null;
alter table public.referral_requests drop constraint if exists referral_requests_timeframe_check;
alter table public.referral_requests add constraint referral_requests_timeframe_check
  check (timeframe is null or timeframe in ('urgent', 'within_two_weeks', 'within_month', 'flexible'));
alter table public.referral_responses add column if not exists capacity_confirmed_at timestamptz;

-- Who was asked. A colleague who was asked and has not replied yet has no reply
-- row, so the asking is recorded here. Read only through the workspace's own
-- functions, which show each person only what concerns them.
create table if not exists public.referral_recipients (
  referral_request_id bigint not null references public.referral_requests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  ord integer not null default 0,
  sent_at timestamptz not null default now(),
  primary key (referral_request_id, profile_id)
);
create index if not exists referral_recipients_profile_idx on public.referral_recipients (profile_id);
alter table public.referral_recipients enable row level security;
revoke all on public.referral_recipients from anon, authenticated;

-- Referrals made, and replies given, anywhere else in the product (the earlier
-- screens, the practice demos) are counted as asked too, so the workspace shows
-- every referral a member is part of.
create or replace function private.referral_recipient_from_response()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into referral_recipients (referral_request_id, profile_id, sent_at)
  values (new.referral_request_id, new.responding_profile_id, new.created_at)
  on conflict do nothing;
  return new;
end;
$function$;
revoke all on function private.referral_recipient_from_response() from public, anon, authenticated;
drop trigger if exists referral_recipient_from_response on public.referral_responses;
create trigger referral_recipient_from_response after insert on public.referral_responses
  for each row execute function private.referral_recipient_from_response();

create or replace function private.referral_recipients_from_audience()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.audience_type = 'selected' and coalesce(array_length(new.audience_profile_ids, 1), 0) > 0 then
    insert into referral_recipients (referral_request_id, profile_id, ord, sent_at)
    select new.id, x.id, x.o::integer, case when tg_op = 'INSERT' then new.created_at else now() end
      from unnest(new.audience_profile_ids) with ordinality as x(id, o)
     where x.id <> new.requesting_profile_id and exists (select 1 from profiles p where p.id = x.id)
    on conflict do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.referral_recipients_from_audience() from public, anon, authenticated;
drop trigger if exists referral_recipients_from_audience on public.referral_requests;
create trigger referral_recipients_from_audience after insert or update of audience_profile_ids on public.referral_requests
  for each row execute function private.referral_recipients_from_audience();

-- Backfill: the colleagues earlier referrals were sent to, and everyone who replied.
insert into public.referral_recipients (referral_request_id, profile_id, ord, sent_at)
select rr.id, x.id, x.o::integer, rr.created_at
  from public.referral_requests rr, unnest(rr.audience_profile_ids) with ordinality as x(id, o)
 where rr.audience_type = 'selected' and x.id <> rr.requesting_profile_id
   and exists (select 1 from public.profiles p where p.id = x.id)
on conflict do nothing;
insert into public.referral_recipients (referral_request_id, profile_id, sent_at)
select r.referral_request_id, r.responding_profile_id, r.created_at from public.referral_responses r
on conflict do nothing;

-- 7b. Who a referral still suits: the same check the screens make, run on the
-- server at the moment of sending, adding, and placing.
create or replace function private.referral_exclusions(p_referral bigint, p_candidate uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select private.cover_exclusions(
    p_candidate, r.state,
    case when r.modality in ('virtual', 'telehealth') then 'virtual' when r.modality in ('in_person', 'in-person', 'face_to_face', 'f2f') then 'in_person' else 'either' end,
    r.prescribing,
    (select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)),
    (select lv.value from lookup_values lv where lv.id = r.specialism_lookup_ids[2]),
    r.age_band, r.insurance,
    (select lv.value from lookup_values lv where lv.id = r.language_lookup_id),
    r.city)
  from referral_requests r where r.id = p_referral;
$function$;
revoke all on function private.referral_exclusions(bigint, uuid) from public, anon, authenticated;

create or replace function private.referral_label(p_id bigint)
returns text
language sql
immutable
as $function$ select 'Referral ' || lpad(p_id::text, 3, '0'); $function$;
revoke all on function private.referral_label(bigint) from public, anon, authenticated;

-- 7c. Make a referral: the need, the audience, the first requests, in one step.
-- Safe to send twice with the same requestId.
create or replace function public.referral_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  cand uuid[];
  kept uuid[] := '{}';
  pid uuid;
  excl text[];
  dropped jsonb := '[]'::jsonb;
  n integer := 0;
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
    select coalesce(array_agg(t.colleague_id order by t.created_at, t.colleague_id), '{}') into cand
      from trusted_colleagues t where t.profile_id = me and t.colleague_id <> me;
  else
    select coalesce(array_agg(vm.id order by private.member_name(vm.id), vm.id), '{}') into cand
      from private.visible_members(me) vm where vm.id <> me;
  end if;
  if array_length(cand, 1) > 500 then
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
    insert into referral_recipients (referral_request_id, profile_id, ord, sent_at)
    select ref_id, k.id, k.o::integer, now() from unnest(kept) with ordinality as k(id, o)
    on conflict do nothing;
    if aud = 'selected' then
      update referral_requests set audience_profile_ids = kept where id = ref_id;
    end if;
    foreach pid in array kept loop
      n := n + 1;
      perform private.notify_member('referral_sent', pid, me, 'sent you a referral request',
                                    '/dashboard/referrals?referral=' || ref_id, 'referral:' || ref_id || ':' || pid,
                                    jsonb_build_object('referralRequestId', ref_id));
    end loop;
  end if;
  perform private.professional_event('referral_sent', me, null, 'sent a referral request',
                                     jsonb_build_object('referralRequestId', ref_id, 'audienceType', aud));
  return jsonb_build_object('referralId', ref_id, 'unchanged', false, 'dropped', dropped, 'asked', n);
end;
$function$;
revoke all on function public.referral_create(jsonb) from public, anon;
grant execute on function public.referral_create(jsonb) to authenticated;

-- 7d. A colleague's reply: interested (capacity confirmed for this referral),
-- a question first, or not available. They can change their mind until the
-- referrer has chosen someone.
create or replace function public.referral_answer(p_referral bigint, p_response text, p_capacity boolean default false, p_question text default null, p_client_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select * into rs from referral_responses where referral_request_id = p_referral and responding_profile_id = me;
  has_rs := found;
  if has_rs and rs.status::text = 'accepted' then
    raise exception 'You''ve already been chosen for this referral.' using errcode = 'P0001';
  end if;
  if r.status::text not in ('open', 'sent', 'matched') then
    raise exception 'This referral is no longer taking replies.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account isn''t active in the network right now, so you can''t reply to referrals.' using errcode = 'P0001';
  end if;

  if p_response = 'interested' then
    if not coalesce(p_capacity, false) then
      raise exception 'Confirm your current capacity to express interest.' using errcode = 'P0001';
    end if;
    select exists (select 1 from private.member_state_settings s where s.profile_id = me and s.state = upper(coalesce(r.state, ''))) into lic;
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
                                         array[r.requesting_profile_id, me], me);
    msg := private.post_message(conv, me, q, p_client_message_id, '/dashboard/messages?thread=' || ckey);
  end if;

  if changed then
    secs := greatest(0, extract(epoch from now() - rc.sent_at)::integer);
    perform private.professional_event('referral_response', me, r.requesting_profile_id, 'responded "' || p_response || '" to a referral request',
                                       jsonb_build_object('referralRequestId', p_referral, 'response', p_response), secs);
    perform private.notify_member('referral_response', r.requesting_profile_id, me,
                                  case p_response when 'interested' then 'is interested in your referral request'
                                                  when 'discussing' then 'asked a question about your referral request'
                                                  else 'is not available for your referral request' end,
                                  '/dashboard/referrals?referral=' || p_referral, 'referral_response:' || p_referral || ':' || me || ':' || p_response,
                                  jsonb_build_object('referralRequestId', p_referral, 'response', p_response));
  end if;
  return jsonb_build_object('status', p_response, 'unchanged', not changed, 'conversationKey', ckey, 'messageId', msg);
end;
$function$;
revoke all on function public.referral_answer(bigint, text, boolean, text, uuid) from public, anon;
grant execute on function public.referral_answer(bigint, text, boolean, text, uuid) to authenticated;

-- 7e. Choose the colleague: the only way a referral becomes placed. Only the
-- referrer, only someone who said they are interested, only once; the other
-- open requests close with it.
create or replace function public.referral_place(p_referral bigint, p_colleague uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    raise exception 'This referral is closed.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from referral_recipients where referral_request_id = p_referral and profile_id = p_colleague) then
    raise exception 'You can only choose a colleague you sent this referral to.' using errcode = 'P0001';
  end if;
  excl := private.referral_exclusions(p_referral, p_colleague);
  if excl[1] like 'No reviewed %' then
    raise exception 'That colleague''s license for % isn''t current, so they can''t take this referral. Please choose another colleague who replied.', r.state using errcode = 'P0001';
  end if;
  res := public.choose_referral_colleague(p_referral, p_colleague);
  if coalesce((res ->> 'already')::boolean, false) then
    return jsonb_build_object('unchanged', true);
  end if;
  perform private.professional_event('professional_relationship_created', me, p_colleague, 'established a professional connection via referral',
                                     jsonb_build_object('referralRequestId', p_referral));
  perform private.professional_event('referral_outcome', me, p_colleague, 'placed a referral with a colleague',
                                     jsonb_build_object('referralRequestId', p_referral));
  perform private.notify_member('referral_connected', p_colleague, me, 'chose you for a referral',
                                '/dashboard/referrals?referral=' || p_referral, 'referral_connected:' || p_referral || ':' || p_colleague,
                                jsonb_build_object('referralRequestId', p_referral));
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.referral_place(bigint, uuid) from public, anon;
grant execute on function public.referral_place(bigint, uuid) to authenticated;

-- 7f. Withdraw: only the referrer, only while it is open. Open requests close;
-- every reply and conversation stays.
create or replace function public.referral_withdraw(p_referral bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  update referral_requests set status = 'closed', closed_at = now(), withdrawn_at = now() where id = p_referral;
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
revoke all on function public.referral_withdraw(bigint) from public, anon;
grant execute on function public.referral_withdraw(bigint) to authenticated;

-- 7g. Ask another colleague: the referrer adds one eligible colleague to an
-- open referral, with the same requirements. Safe to repeat.
create or replace function public.referral_add(p_referral bigint, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  excl text[];
  nxt integer;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id <> me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status::text not in ('open', 'sent', 'matched') then
    raise exception 'This referral is no longer open.' using errcode = 'P0001';
  end if;
  if p_person is null or p_person = me then
    raise exception 'Choose a colleague.' using errcode = 'P0001';
  end if;
  if exists (select 1 from referral_recipients where referral_request_id = p_referral and profile_id = p_person) then
    return jsonb_build_object('unchanged', true);
  end if;
  excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = p_person)
               then private.referral_exclusions(p_referral, p_person)
               else array['Not a colleague you can ask'] end;
  if array_length(excl, 1) is not null then
    raise exception 'That colleague no longer matches this referral: %.', array_to_string(excl, '; ') using errcode = 'P0001';
  end if;
  select coalesce(max(ord), 0) + 1 into nxt from referral_recipients where referral_request_id = p_referral;
  insert into referral_recipients (referral_request_id, profile_id, ord, sent_at) values (p_referral, p_person, nxt, now())
  on conflict do nothing;
  if r.audience_type = 'selected' and not (p_person = any (r.audience_profile_ids)) then
    update referral_requests set audience_profile_ids = audience_profile_ids || p_person where id = p_referral;
  end if;
  perform private.notify_member('referral_sent', p_person, me, 'sent you a referral request',
                                '/dashboard/referrals?referral=' || p_referral, 'referral:' || p_referral || ':' || p_person,
                                jsonb_build_object('referralRequestId', p_referral));
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.referral_add(bigint, uuid) from public, anon;
grant execute on function public.referral_add(bigint, uuid) to authenticated;

-- 7h. The conversation about one colleague's request: one key whoever opens it.
create or replace function public.referral_thread(p_referral bigint, p_person uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  resp uuid;
  ckey text;
  conv bigint;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral;
  if not found then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  resp := case when r.requesting_profile_id = me then p_person else me end;
  if resp is null or resp = r.requesting_profile_id
     or not exists (select 1 from referral_recipients where referral_request_id = p_referral and profile_id = resp)
     or public.is_blocked_between(me, case when r.requesting_profile_id = me then resp else r.requesting_profile_id end) then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  ckey := 'referral-' || p_referral || '-' || resp;
  conv := private.context_conversation(ckey, private.referral_label(p_referral) || ' · ' || coalesce((select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)), 'Client need'),
                                       array[r.requesting_profile_id, resp], me);
  return jsonb_build_object('conversationKey', ckey, 'conversationId', conv);
end;
$function$;
revoke all on function public.referral_thread(bigint, uuid) from public, anon;
grant execute on function public.referral_thread(bigint, uuid) to authenticated;

-- 7i. What the workspace reads. A colleague sees only their own request and the
-- referrer's note, never who else was asked, and is not told who a referral
-- was placed with unless it was them.
create or replace function private.referral_json(p_referral bigint, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
               'status', case when b.base in ('awaiting', 'interested', 'discussing') and st <> 'discussion' then 'closed' else b.base end,
               'order', rc.ord, 'sentAt', rc.sent_at, 'respondedAt', rs.responded_at, 'capacityConfirmedAt', rs.capacity_confirmed_at,
               'beforeWithdrawal', case when st = 'withdrawn' and b.base in ('awaiting', 'interested', 'discussing') then b.base end) as j
        from referral_recipients rc
        left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
        cross join lateral (select case rs.status::text when 'accepted' then 'placed' when 'interested' then 'interested' when 'offered' then 'interested'
                                                       when 'question' then 'discussing' when 'unavailable' then 'declined' when 'withdrawn' then 'declined'
                                                       else 'awaiting' end as base) b
       where rc.referral_request_id = r.id and (own or rc.profile_id = p_viewer)
    ) x;
  return jsonb_build_object(
    'id', r.id,
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
    'placedWith', case when chosen is null then null when own then chosen::text when chosen = p_viewer then 'me' else null end,
    'placedElsewhere', (not own and st = 'placed' and chosen is distinct from p_viewer),
    'createdAt', r.created_at,
    'withdrawnAt', case when st = 'withdrawn' then coalesce(r.withdrawn_at, r.closed_at) end);
end;
$function$;
revoke all on function private.referral_json(bigint, uuid) from public, anon, authenticated;

create or replace function public.workspace_referrals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(private.referral_json(r.id, auth.uid()) order by r.created_at desc, r.id desc), '[]'::jsonb)
    from referral_requests r
   where auth.uid() is not null
     and (r.requesting_profile_id = auth.uid()
          or (exists (select 1 from referral_recipients rc where rc.referral_request_id = r.id and rc.profile_id = auth.uid())
              and not public.is_blocked_between(auth.uid(), r.requesting_profile_id)));
$function$;
revoke all on function public.workspace_referrals() from public, anon;
grant execute on function public.workspace_referrals() to authenticated;

-- 8. Known people ----------------------------------------------------------------
-- People the screens mention who are not (or are no longer) in the member's
-- directory: a colleague asked earlier who has since left, been paused or
-- blocked. Name and role only, so history stays readable and nothing else leaks.
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

-- 9. Slices and boot -------------------------------------------------------------
-- (This section stays last: it names every read model above it.)
-- Any part of the workspace on its own, so a save can send back just what it
-- changed. Unknown names are ignored.
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
      else '{}'::jsonb
    end;
  end loop;
  return r;
end;
$function$;
revoke all on function public.workspace_slice(text[]) from public, anon;
grant execute on function public.workspace_slice(text[]) to authenticated;

-- Everything the workspace needs on first load, in one round trip.
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
  -- Who the workspace is for: verified clinicians in the network. Everyone
  -- else keeps the existing screens (operators, a referring provider with no
  -- profile, a member whose verification is still in progress).
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
         || public.workspace_slice(array['me', 'people', 'known', 'tiers', 'availability', 'drafts', 'plans', 'referrals']);
end;
$function$;
revoke all on function public.workspace_boot() from public, anon;
grant execute on function public.workspace_boot() to authenticated;
