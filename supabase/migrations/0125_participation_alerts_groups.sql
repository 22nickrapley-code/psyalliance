-- Release C: participation choices, service pauses, phone alerts (web push, SMS-ready), group charter history.
-- Safe to run twice. Existing members keep today's behaviour: nothing here opts anyone in to anything.

-- 1. Participation ------------------------------------------------------------------
create table if not exists public.member_participation (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- Private by default. Stable identifiers only, never free text and never shown to colleagues.
  situations text[] not null default '{}',
  situations_updated_at timestamptz,
  -- Which kinds of request a colleague may send. true = as before (open). A person with no
  -- referral spaces can still be open to cover or consult.
  open_referrals boolean not null default true,
  open_cover boolean not null default true,
  open_consult boolean not null default true,
  -- Pauses cover new requests only. They never touch work already under way.
  paused_referrals boolean not null default false,
  paused_cover boolean not null default false,
  paused_consult boolean not null default false,
  pause_referrals_until date,
  pause_cover_until date,
  pause_consult_until date,
  -- Alerts to a phone. Both off until the member turns them on.
  alert_push boolean not null default false,
  alert_sms boolean not null default false,
  sms_phone text,
  sms_consent_at timestamptz,
  quiet_start time,
  quiet_end time,
  quiet_timezone text not null default 'America/New_York',
  -- Choice carried from the public "Show me how PsyAlliance could help" route.
  starting_intent text,
  starting_intent_at timestamptz,
  starting_intent_used_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint situations_known check (situations <@ array['starting_practice','building_caseload','professional_perspective','time_away','returning_relocating','reducing_closing','something_else','prefer_not_to_say']),
  constraint intent_known check (starting_intent is null or starting_intent in ('caseload','time_away','client_referral','perspective','reducing','explore','offer_support')),
  constraint sms_phone_shape check (sms_phone is null or sms_phone ~ '^\+[1-9][0-9]{7,14}$')
);
alter table public.member_participation enable row level security;
drop policy if exists "own participation only" on public.member_participation;
create policy "own participation only" on public.member_participation
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create or replace function private.service_paused(p_member uuid, p_kind text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select case p_kind
      when 'referral' then mp.paused_referrals and (mp.pause_referrals_until is null or mp.pause_referrals_until >= current_date)
      when 'cover' then mp.paused_cover and (mp.pause_cover_until is null or mp.pause_cover_until >= current_date)
      when 'consult' then mp.paused_consult and (mp.pause_consult_until is null or mp.pause_consult_until >= current_date)
    end from member_participation mp where mp.profile_id = p_member), false);
$$;
revoke all on function private.service_paused(uuid, text) from public, anon, authenticated;

create or replace function private.service_open(p_member uuid, p_kind text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select case p_kind when 'referral' then mp.open_referrals when 'cover' then mp.open_cover when 'consult' then mp.open_consult end
      from member_participation mp where mp.profile_id = p_member), true);
$$;
revoke all on function private.service_open(uuid, text) from public, anon, authenticated;

-- A pause or a closed door excludes a colleague from NEW requests only (matching and outreach). Answering a
-- request that was already sent is unaffected: cover_answer only checks the licence.
do $$
declare def text; marker text := 'service_paused';
begin
  select pg_get_functiondef('private.cover_exclusions(uuid,text,text,boolean,text,text,text,text,text,text,text)'::regprocedure) into def;
  if position(marker in def) = 0 then
    def := replace(def,
      'case when coalesce(p_kind, ''cover'') = ''cover'' and (select cover from cand) = ''no'' then ''Not open to cover'' end',
      'case when coalesce(p_kind, ''cover'') = ''cover'' and (select cover from cand) = ''no'' then ''Not open to cover'' end,
    case when private.service_paused(p_candidate, case when coalesce(p_kind, ''cover'') = ''cover'' then ''cover'' else ''referral'' end) then ''Paused new '' || case when coalesce(p_kind, ''cover'') = ''cover'' then ''cover'' else ''referral'' end || '' requests'' end,
    case when not private.service_open(p_candidate, case when coalesce(p_kind, ''cover'') = ''cover'' then ''cover'' else ''referral'' end) then ''Not taking '' || case when coalesce(p_kind, ''cover'') = ''cover'' then ''cover'' else ''referral'' end || '' requests'' end');
    execute def;
  end if;
end $$;

create or replace function public.my_participation()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select jsonb_build_object(
      'situations', mp.situations, 'openReferrals', mp.open_referrals, 'openCover', mp.open_cover, 'openConsult', mp.open_consult,
      'pausedReferrals', private.service_paused(mp.profile_id, 'referral'), 'pausedCover', private.service_paused(mp.profile_id, 'cover'), 'pausedConsult', private.service_paused(mp.profile_id, 'consult'),
      'pauseReferralsUntil', mp.pause_referrals_until, 'pauseCoverUntil', mp.pause_cover_until, 'pauseConsultUntil', mp.pause_consult_until,
      -- A pause that has run out is not "accepting again": the member is asked to review first.
      'reviewReferrals', mp.paused_referrals and mp.pause_referrals_until < current_date,
      'reviewCover', mp.paused_cover and mp.pause_cover_until < current_date,
      'reviewConsult', mp.paused_consult and mp.pause_consult_until < current_date,
      'alertPush', mp.alert_push, 'alertSms', mp.alert_sms, 'smsPhone', mp.sms_phone, 'quietStart', mp.quiet_start, 'quietEnd', mp.quiet_end,
      'startingIntent', case when mp.starting_intent_used_at is null then mp.starting_intent end)
    from member_participation mp where mp.profile_id = auth.uid()), '{}'::jsonb);
$$;
grant execute on function public.my_participation() to authenticated;

create or replace function public.set_my_participation(p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); sit text[];
begin
  if me is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into member_participation (profile_id) values (me) on conflict do nothing;
  if p ? 'situations' then
    select coalesce(array_agg(distinct x), '{}') into sit from jsonb_array_elements_text(p -> 'situations') x;
    update member_participation set situations = sit, situations_updated_at = now() where profile_id = me;
  end if;
  update member_participation set
    open_referrals = coalesce((p ->> 'openReferrals')::boolean, open_referrals),
    open_cover = coalesce((p ->> 'openCover')::boolean, open_cover),
    open_consult = coalesce((p ->> 'openConsult')::boolean, open_consult),
    paused_referrals = coalesce((p ->> 'pausedReferrals')::boolean, paused_referrals),
    paused_cover = coalesce((p ->> 'pausedCover')::boolean, paused_cover),
    paused_consult = coalesce((p ->> 'pausedConsult')::boolean, paused_consult),
    pause_referrals_until = case when p ? 'pauseReferralsUntil' then nullif(p ->> 'pauseReferralsUntil', '')::date else pause_referrals_until end,
    pause_cover_until = case when p ? 'pauseCoverUntil' then nullif(p ->> 'pauseCoverUntil', '')::date else pause_cover_until end,
    pause_consult_until = case when p ? 'pauseConsultUntil' then nullif(p ->> 'pauseConsultUntil', '')::date else pause_consult_until end,
    alert_push = coalesce((p ->> 'alertPush')::boolean, alert_push),
    quiet_start = case when p ? 'quietStart' then nullif(p ->> 'quietStart', '')::time else quiet_start end,
    quiet_end = case when p ? 'quietEnd' then nullif(p ->> 'quietEnd', '')::time else quiet_end end,
    updated_at = now()
  where profile_id = me;
  -- A phone number is stored only with an explicit consent, and removed with it.
  if p ? 'smsPhone' then
    if nullif(p ->> 'smsPhone', '') is null then
      update member_participation set sms_phone = null, sms_consent_at = null, alert_sms = false where profile_id = me;
    else
      if coalesce((p ->> 'smsConsent')::boolean, false) is not true then
        raise exception 'Tick the box to agree to text alerts first.' using errcode = 'P0001';
      end if;
      update member_participation set sms_phone = p ->> 'smsPhone', sms_consent_at = now(), alert_sms = coalesce((p ->> 'alertSms')::boolean, true) where profile_id = me;
    end if;
  elsif p ? 'alertSms' then
    update member_participation set alert_sms = (p ->> 'alertSms')::boolean and sms_phone is not null where profile_id = me;
  end if;
end;
$$;
grant execute on function public.set_my_participation(jsonb) to authenticated;

-- The choice carried from the public route is stored only after sign-in, once, and can be cleared.
create or replace function public.set_starting_intent(p_intent text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into member_participation (profile_id) values (auth.uid()) on conflict do nothing;
  update member_participation set starting_intent = nullif(p_intent, ''), starting_intent_at = case when nullif(p_intent, '') is null then null else now() end,
         starting_intent_used_at = null where profile_id = auth.uid();
end;
$$;
grant execute on function public.set_starting_intent(text) to authenticated;

create or replace function public.use_starting_intent()
returns void language sql security definer set search_path to 'public' as $$
  update member_participation set starting_intent_used_at = now() where profile_id = auth.uid();
$$;
grant execute on function public.use_starting_intent() to authenticated;

-- 2. Phone alerts ------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

alter table public.notification_deliveries drop constraint if exists notification_deliveries_channel_check;
alter table public.notification_deliveries add constraint notification_deliveries_channel_check check (channel in ('in_app', 'email', 'digest', 'push', 'sms'));
alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check check (status in
  ('pending', 'sent', 'failed', 'suppressed_dedup', 'suppressed_preference', 'suppressed_read', 'suppressed_demo', 'suppressed_closed'));
create index if not exists notification_deliveries_alert_idx on public.notification_deliveries (send_after) where channel in ('push', 'sms') and status = 'pending';

create or replace function private.after_quiet(p_member uuid, p_at timestamptz)
returns timestamptz language plpgsql stable security definer set search_path to 'public' as $$
declare mp record; local_t time; local_d date; end_ts timestamptz;
begin
  select quiet_start, quiet_end, quiet_timezone into mp from member_participation where profile_id = p_member;
  if mp.quiet_start is null or mp.quiet_end is null or mp.quiet_start = mp.quiet_end then return p_at; end if;
  local_t := (p_at at time zone mp.quiet_timezone)::time;
  local_d := (p_at at time zone mp.quiet_timezone)::date;
  if mp.quiet_start < mp.quiet_end then
    if local_t >= mp.quiet_start and local_t < mp.quiet_end then
      end_ts := ((local_d + mp.quiet_end) at time zone mp.quiet_timezone);
    end if;
  else
    if local_t >= mp.quiet_start then
      end_ts := (((local_d + 1) + mp.quiet_end) at time zone mp.quiet_timezone);
    elsif local_t < mp.quiet_end then
      end_ts := ((local_d + mp.quiet_end) at time zone mp.quiet_timezone);
    end if;
  end if;
  return coalesce(end_ts, p_at);
end;
$$;
revoke all on function private.after_quiet(uuid, timestamptz) from public, anon, authenticated;

-- Every in-app notification about a request or a reply can also reach a phone, only for members who turned that on.
create or replace function private.fan_out_phone_alerts()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ev record; mp record;
begin
  if new.channel <> 'in_app' then return new; end if;
  select event_type, actor_profile_id into ev from notification_events where id = new.notification_event_id;
  if ev.event_type not in ('coverage_request', 'coverage_response', 'coverage_confirmed', 'referral_sent', 'referral_response', 'referral_connected', 'consultation_invite', 'consultation_response') then
    return new;
  end if;
  select * into mp from member_participation where profile_id = new.recipient_profile_id;
  if not found then return new; end if;
  if mp.alert_push and exists (select 1 from push_subscriptions s where s.profile_id = new.recipient_profile_id and s.revoked_at is null) then
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, send_after)
    values (new.notification_event_id, new.recipient_profile_id, 'push', 'pending', private.after_quiet(new.recipient_profile_id, now()));
  end if;
  if mp.alert_sms and mp.sms_phone is not null and mp.sms_consent_at is not null then
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, send_after)
    values (new.notification_event_id, new.recipient_profile_id, 'sms', 'pending', private.after_quiet(new.recipient_profile_id, now()));
  end if;
  return new;
end;
$$;
drop trigger if exists fan_out_phone_alerts on public.notification_deliveries;
create trigger fan_out_phone_alerts after insert on public.notification_deliveries
  for each row execute function private.fan_out_phone_alerts();

-- What the sender is allowed to say. Only who and what kind of request: never a client reference, never message text.
create or replace function private.alert_text(p_event_type text, p_actor uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(split_part(coalesce(private.member_name(p_actor), ''), ' ', 1), ''), 'A colleague') || ' ' ||
    case p_event_type
      when 'coverage_request' then 'has sent you a Cover request. Review request.'
      when 'coverage_response' then 'has replied to your Cover request. Review reply.'
      when 'coverage_confirmed' then 'has replied to your Cover request. Review reply.'
      when 'referral_sent' then 'has sent you a referral request. Review request.'
      when 'referral_response' then 'has replied to your referral. Review reply.'
      when 'referral_connected' then 'has replied to your referral. Review reply.'
      when 'consultation_invite' then 'has asked you a question. Review question.'
      else 'has replied to your question. Review reply.' end;
$$;
revoke all on function private.alert_text(text, uuid) from public, anon, authenticated;

-- Claimed by the app's alert sender (service role only). Suppresses anything already opened in the app,
-- anything for a demo or non-active account, and anything older than a day.
create or replace function public.claim_alerts(p_limit integer default 25)
returns table (delivery_id bigint, channel text, recipient uuid, body text, link text, endpoint text, p256dh text, auth text, phone text)
language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  update notification_deliveries set status = 'failed', error = 'Not sent: too old' where channel in ('push', 'sms') and status = 'pending' and created_at < now() - interval '1 day';
  for r in
    select nd.id, nd.channel as ch, nd.recipient_profile_id as rid, ev.event_type, ev.actor_profile_id, ev.deep_link, p.is_demo, p.account_status,
           exists (select 1 from notification_deliveries i where i.notification_event_id = nd.notification_event_id and i.recipient_profile_id = nd.recipient_profile_id and i.channel = 'in_app' and i.read_at is not null) as seen
      from notification_deliveries nd
      join notification_events ev on ev.id = nd.notification_event_id
      join profiles p on p.id = nd.recipient_profile_id
     where nd.channel in ('push', 'sms') and nd.status = 'pending' and nd.send_after <= now() and nd.retry_count < 3
     order by nd.send_after limit p_limit for update of nd skip locked
  loop
    if r.is_demo or r.account_status <> 'active' then
      update notification_deliveries set status = 'suppressed_demo', attempted_at = now() where id = r.id; continue;
    end if;
    if r.seen then
      update notification_deliveries set status = 'suppressed_read', attempted_at = now() where id = r.id; continue;
    end if;
    update notification_deliveries set attempted_at = now(), retry_count = retry_count + 1 where id = r.id;
    if r.ch = 'push' then
      return query select r.id, 'push'::text, r.rid, private.alert_text(r.event_type, r.actor_profile_id), r.deep_link, s.endpoint, s.p256dh, s.auth, null::text
        from push_subscriptions s where s.profile_id = r.rid and s.revoked_at is null;
    else
      return query select r.id, 'sms'::text, r.rid, private.alert_text(r.event_type, r.actor_profile_id), r.deep_link, null::text, null::text, null::text, mp.sms_phone
        from member_participation mp where mp.profile_id = r.rid and mp.alert_sms and mp.sms_consent_at is not null and mp.sms_phone is not null;
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_alerts(integer) from public, anon, authenticated;

create or replace function public.finish_alert(p_delivery bigint, p_ok boolean, p_error text default null, p_gone_endpoint text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_ok then
    update notification_deliveries set status = 'sent', delivered_at = now() where id = p_delivery;
  else
    update notification_deliveries set error = left(p_error, 300),
      status = case when retry_count >= 3 then 'failed' else 'pending' end,
      send_after = now() + interval '5 minutes' where id = p_delivery;
  end if;
  if p_gone_endpoint is not null then update push_subscriptions set revoked_at = now() where endpoint = p_gone_endpoint; end if;
end;
$$;
revoke all on function public.finish_alert(bigint, boolean, text, text) from public, anon, authenticated;

-- 3. Groups: charter history and organiser actions --------------------------------------
create table if not exists public.consultation_group_charters (
  group_id bigint not null references public.consultation_groups (id) on delete cascade,
  version integer not null,
  body text not null,
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz not null default now(),
  primary key (group_id, version)
);
alter table public.consultation_group_charters enable row level security;
drop policy if exists "members read their group's charter history" on public.consultation_group_charters;
create policy "members read their group's charter history" on public.consultation_group_charters
  for select using (exists (select 1 from consultation_group_members m where m.group_id = consultation_group_charters.group_id and m.profile_id = (select auth.uid()) and m.status = 'joined')
                    or exists (select 1 from consultation_groups g where g.id = consultation_group_charters.group_id and g.created_by = (select auth.uid())));

insert into public.consultation_group_charters (group_id, version, body, edited_by)
select g.id, g.charter_version, g.charter_body, g.created_by from public.consultation_groups g
 where g.charter_body is not null and not exists (select 1 from public.consultation_group_charters c where c.group_id = g.id);

create or replace function private.group_charter_versioning()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.charter_body is not null then
      insert into consultation_group_charters (group_id, version, body, edited_by) values (new.id, new.charter_version, new.charter_body, auth.uid()) on conflict do nothing;
    end if;
  elsif new.charter_body is distinct from old.charter_body and new.charter_body is not null then
    new.charter_version := old.charter_version + 1;
    insert into consultation_group_charters (group_id, version, body, edited_by) values (new.id, new.charter_version, new.charter_body, auth.uid()) on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists group_charter_versioning_ins on public.consultation_groups;
create trigger group_charter_versioning_ins after insert on public.consultation_groups for each row execute function private.group_charter_versioning();
drop trigger if exists group_charter_versioning_upd on public.consultation_groups;
create trigger group_charter_versioning_upd before update of charter_body on public.consultation_groups for each row execute function private.group_charter_versioning();

-- Organisers are the creator and any coordinator. Only they edit the charter, invite and remove; only the creator
-- appoints coordinators. Ordinary members can read, post and leave.
create or replace function private.group_is_organiser(p_group bigint, p_member uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from consultation_groups g where g.id = p_group and g.created_by = p_member)
      or exists (select 1 from consultation_group_members m where m.group_id = p_group and m.profile_id = p_member and m.status = 'joined' and m.role in ('creator', 'coordinator'));
$$;
revoke all on function private.group_is_organiser(bigint, uuid) from public, anon, authenticated;

create or replace function public.group_edit_charter(p_group bigint, p_body text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v integer;
begin
  if not private.group_is_organiser(p_group, auth.uid()) then raise exception 'Only the group''s organisers can change its charter.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 20 then raise exception 'Write a charter of at least a couple of sentences.' using errcode = 'P0001'; end if;
  update consultation_groups set charter_body = p_body where id = p_group returning charter_version into v;
  return v;
end;
$$;
grant execute on function public.group_edit_charter(bigint, text) to authenticated;

create or replace function public.group_set_role(p_group bigint, p_member uuid, p_role text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from consultation_groups g where g.id = p_group and g.created_by = auth.uid()) then
    raise exception 'Only the person who started the group can appoint organisers.' using errcode = '42501';
  end if;
  if p_role not in ('coordinator', 'member') then raise exception 'Unknown role.' using errcode = 'P0001'; end if;
  update consultation_group_members set role = p_role where group_id = p_group and profile_id = p_member and status = 'joined' and role <> 'creator';
  if not found then raise exception 'That person is not a joined member.' using errcode = 'P0001'; end if;
end;
$$;
grant execute on function public.group_set_role(bigint, uuid, text) to authenticated;

create or replace function public.group_remove_member(p_group bigint, p_member uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not private.group_is_organiser(p_group, auth.uid()) then raise exception 'Only the group''s organisers can remove a member.' using errcode = '42501'; end if;
  if exists (select 1 from consultation_groups g where g.id = p_group and g.created_by = p_member) then
    raise exception 'The person who started the group cannot be removed.' using errcode = 'P0001';
  end if;
  update consultation_group_members set status = 'removed', responded_at = now() where group_id = p_group and profile_id = p_member and status in ('joined', 'invited');
end;
$$;
grant execute on function public.group_remove_member(bigint, uuid) to authenticated;
