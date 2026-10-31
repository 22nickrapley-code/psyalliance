-- PsyAlliance 1.0 corrections. Safe to run more than once.

-- 1. Lifecycle events (review F09) ----------------------------------------------------------------
-- A visitor (anon) can no longer write the "real" namespace; only a signed-in member's own product
-- actions can. "demo_started" separates opening a demo from completing an exercise.
alter table public.lifecycle_events drop constraint if exists lifecycle_events_event_check;
alter table public.lifecycle_events add constraint lifecycle_events_event_check check (event in (
  'guide_start', 'guide_choice', 'demo_started', 'interaction_complete', 'interaction_skip', 'recipient_preview', 'summary_continue',
  'handoff_adopted', 'handoff_cleared', 'task_start', 'first_result', 'review_send', 'first_response', 'collaboration_complete',
  'return_resume', 'pause', 'delivery_failure'));

create or replace function public.log_lifecycle_event(p_namespace text, p_event text, p_need text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_namespace not in ('demo', 'practice', 'real') then return; end if;
  -- Real product events come only from a signed-in member, never from an anonymous caller.
  if p_namespace = 'real' and auth.uid() is null then return; end if;
  insert into lifecycle_events (namespace, event, need) values (p_namespace, p_event, nullif(p_need, ''));
exception when check_violation then null;  -- an unknown event is ignored, never an error for the visitor
end;
$$;
revoke all on function public.log_lifecycle_event(text, text, text) from public;
grant execute on function public.log_lifecycle_event(text, text, text) to anon, authenticated;

-- 2. Matching sees each colleague's own service choices (review F05) ---------------------------------
-- workspace_people gains "participation": whether the colleague is open to NEW referral, cover and consult
-- requests right now (open and not paused). The workspace hides closed colleagues from matching and says
-- why in bulk selection; the server still checks on send (private.cover_exclusions, consult send guard).
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
    'selectedOnly', p.referral_availability = 'limited',
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'yes' then 'yes' when 'ask_me' then 'ask' when 'no' then 'no' end,
    'consult', p.consultation_availability is distinct from 'no',
    'participation', jsonb_build_object(
      'referral', private.service_open(p.id, 'referral') and not private.service_paused(p.id, 'referral'),
      'cover', private.service_open(p.id, 'cover') and not private.service_paused(p.id, 'cover'),
      'consult', private.service_open(p.id, 'consult') and not private.service_paused(p.id, 'consult')),
    'bio', coalesce(p.bio, ''),
    'referralMode', coalesce(p.referral_availability, 'yes'),
    'consultMode', coalesce(p.consultation_availability, 'yes'),
    'boardCertified', coalesce(p.board_certified, false),
    'founding', (select jsonb_build_object('state', fp.state, 'place', fp.place) from founding_places fp where fp.profile_id = p.id),
    'avatarPath', p.avatar_path
  ) order by p.full_name), '[]'::jsonb)
  from vm join profiles p on p.id = vm.id
  left join facts f on f.profile_id = p.id
  left join lic on lic.profile_id = p.id
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;

-- 3. Phone alerts: one claim at a time, one attempt per device, checks at the last moment (review F01-F03) ----
-- A claimed delivery carries a token and a short lease, so two dispatchers can never send it twice; a lease that
-- runs out (a crashed dispatcher) is picked up again. Each device (or the phone number) has its own attempt, so one
-- device failing never resends to another that already received it. Consent, quiet hours and "already read" are
-- checked again at claim time. The device asks for the alerts sent to IT (by endpoint), each with its own link.
alter table public.notification_deliveries add column if not exists claim_token uuid;
alter table public.notification_deliveries add column if not exists lease_until timestamptz;

create table if not exists public.alert_attempts (
  delivery_id bigint not null references public.notification_deliveries (id) on delete cascade,
  target text not null,                       -- a push endpoint, or 'sms'
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'gone')),
  tries integer not null default 0,
  error text,
  sent_at timestamptz,
  shown_at timestamptz,                       -- the device fetched this alert's wording and link
  primary key (delivery_id, target)
);
alter table public.alert_attempts enable row level security;
revoke all on public.alert_attempts from anon, authenticated;

drop function if exists public.claim_alerts(integer);
create or replace function public.claim_alerts(p_limit integer default 25)
returns table (delivery_id bigint, token uuid, channel text, recipient uuid, body text, link text, endpoint text, p256dh text, auth text, phone text)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare r record; v_token uuid; v_quiet timestamptz;
begin
  update notification_deliveries set status = 'failed', error = 'Not sent: too old', claim_token = null, lease_until = null
   where channel in ('push', 'sms') and status = 'pending' and created_at < now() - interval '1 day';
  for r in
    select nd.id, nd.channel as ch, nd.recipient_profile_id as rid, ev.event_type, ev.actor_profile_id, ev.deep_link, p.is_demo, p.account_status,
           mp.alert_push, mp.alert_sms, mp.sms_consent_at, mp.sms_phone,
           exists (select 1 from notification_deliveries i where i.notification_event_id = nd.notification_event_id and i.recipient_profile_id = nd.recipient_profile_id and i.channel = 'in_app' and i.read_at is not null) as seen
      from notification_deliveries nd
      join notification_events ev on ev.id = nd.notification_event_id
      join profiles p on p.id = nd.recipient_profile_id
      left join member_participation mp on mp.profile_id = nd.recipient_profile_id
     where nd.channel in ('push', 'sms') and nd.status = 'pending' and nd.send_after <= now() and nd.retry_count < 3
       and (nd.lease_until is null or nd.lease_until < now())
     order by nd.send_after limit p_limit for update of nd skip locked
  loop
    if r.is_demo or r.account_status <> 'active' then
      update notification_deliveries set status = 'suppressed_demo', attempted_at = now(), claim_token = null, lease_until = null where id = r.id; continue;
    end if;
    if r.seen then
      update notification_deliveries set status = 'suppressed_read', attempted_at = now(), claim_token = null, lease_until = null where id = r.id; continue;
    end if;
    -- Consent as it is NOW, not as it was when the alert was queued.
    if (r.ch = 'push' and not coalesce(r.alert_push, false)) or (r.ch = 'sms' and not (coalesce(r.alert_sms, false) and r.sms_consent_at is not null and r.sms_phone is not null)) then
      update notification_deliveries set status = 'suppressed_closed', attempted_at = now(), error = 'Alerts switched off before sending', claim_token = null, lease_until = null where id = r.id; continue;
    end if;
    -- Quiet hours as they are NOW.
    v_quiet := private.after_quiet(r.rid, now());
    if v_quiet > now() then
      update notification_deliveries set send_after = v_quiet where id = r.id; continue;
    end if;
    v_token := gen_random_uuid();
    update notification_deliveries set attempted_at = now(), retry_count = retry_count + 1, claim_token = v_token, lease_until = now() + interval '2 minutes' where id = r.id;
    if r.ch = 'push' then
      insert into alert_attempts (delivery_id, target)
        select r.id, s.endpoint from push_subscriptions s where s.profile_id = r.rid and s.revoked_at is null
        on conflict do nothing;
      update alert_attempts a set status = 'sending', tries = tries + 1
        from push_subscriptions s
       where a.delivery_id = r.id and a.target = s.endpoint and s.profile_id = r.rid and s.revoked_at is null and a.status in ('pending', 'failed');
      return query select r.id, v_token, 'push'::text, r.rid, private.alert_text(r.event_type, r.actor_profile_id), r.deep_link, s.endpoint, s.p256dh, s.auth, null::text
        from push_subscriptions s join alert_attempts a on a.delivery_id = r.id and a.target = s.endpoint
       where s.profile_id = r.rid and s.revoked_at is null and a.status = 'sending';
    else
      insert into alert_attempts (delivery_id, target) values (r.id, 'sms') on conflict do nothing;
      update alert_attempts set status = 'sending', tries = tries + 1 where delivery_id = r.id and target = 'sms' and status in ('pending', 'failed');
      return query select r.id, v_token, 'sms'::text, r.rid, private.alert_text(r.event_type, r.actor_profile_id), r.deep_link, null::text, null::text, null::text, r.sms_phone
        where exists (select 1 from alert_attempts a where a.delivery_id = r.id and a.target = 'sms' and a.status = 'sending');
    end if;
    -- Nothing left to send (no active device): close it rather than retrying forever.
    if not exists (select 1 from alert_attempts a where a.delivery_id = r.id and a.status = 'sending') then
      update notification_deliveries set status = case when exists (select 1 from alert_attempts a where a.delivery_id = r.id and a.status = 'sent') then 'sent' else 'failed' end,
             error = coalesce(error, 'No active device'), claim_token = null, lease_until = null where id = r.id;
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_alerts(integer) from public, anon, authenticated;

-- One device's result. Only the dispatcher holding the current token can record it.
drop function if exists public.finish_alert(bigint, boolean, text, text);
create or replace function public.finish_alert(p_delivery bigint, p_token uuid, p_target text, p_ok boolean, p_error text default null, p_gone boolean default false)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_open integer; v_sent integer;
begin
  if not exists (select 1 from notification_deliveries where id = p_delivery and claim_token = p_token) then return false; end if;
  update alert_attempts set status = case when p_ok then 'sent' when p_gone then 'gone' else 'failed' end,
         sent_at = case when p_ok then now() else sent_at end, error = case when p_ok then null else left(p_error, 300) end
   where delivery_id = p_delivery and target = p_target and status = 'sending';
  if p_gone and p_target <> 'sms' then update push_subscriptions set revoked_at = now() where endpoint = p_target; end if;
  select count(*) filter (where status = 'sending'), count(*) filter (where status = 'sent') into v_open, v_sent from alert_attempts where delivery_id = p_delivery;
  if v_open = 0 then
    if exists (select 1 from alert_attempts where delivery_id = p_delivery and status = 'failed') then
      -- Retry only the devices that failed; the ones that received it are not sent again.
      update notification_deliveries set claim_token = null, lease_until = null, error = left(p_error, 300),
             status = case when retry_count >= 3 then (case when v_sent > 0 then 'sent' else 'failed' end) else 'pending' end,
             delivered_at = case when v_sent > 0 then coalesce(delivered_at, now()) else delivered_at end,
             send_after = now() + interval '5 minutes'
       where id = p_delivery;
    else
      update notification_deliveries set claim_token = null, lease_until = null,
             status = case when v_sent > 0 then 'sent' else 'failed' end, delivered_at = case when v_sent > 0 then now() end,
             error = case when v_sent > 0 then null else coalesce(left(p_error, 300), error) end
       where id = p_delivery;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function public.finish_alert(bigint, uuid, text, boolean, text, boolean) from public, anon, authenticated;

-- The device asks for the alerts sent to it, oldest first, each with its own wording and link (never "the latest").
drop function if exists public.my_device_alerts(text);
create or replace function public.my_device_alerts(p_endpoint text)
returns table (id bigint, body text, link text) language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not exists (select 1 from push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid()) then return; end if;
  return query
  with mine as (
    select a.delivery_id from alert_attempts a join notification_deliveries nd on nd.id = a.delivery_id
     where a.target = p_endpoint and a.status in ('sending', 'sent') and a.shown_at is null
       and nd.recipient_profile_id = auth.uid() and nd.created_at > now() - interval '1 day'
     order by a.delivery_id limit 5
  ), marked as (
    update alert_attempts a set shown_at = now() from mine where a.delivery_id = mine.delivery_id and a.target = p_endpoint returning a.delivery_id
  )
  select nd.id, private.alert_text(ev.event_type, ev.actor_profile_id), ev.deep_link
    from marked join notification_deliveries nd on nd.id = marked.delivery_id join notification_events ev on ev.id = nd.notification_event_id
   order by nd.id;
end;
$$;
revoke all on function public.my_device_alerts(text) from public, anon;
grant execute on function public.my_device_alerts(text) to authenticated;
-- The old "latest alert" lookup could open the wrong context; it is retired.
drop function if exists public.my_latest_alert();


-- 4. US spelling in the group messages members see (review F17). Bodies otherwise unchanged from 0125.
create or replace function public.group_edit_charter(p_group bigint, p_body text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v integer;
begin
  if not private.group_is_organiser(p_group, auth.uid()) then raise exception 'Only the group''s organizers can change its charter.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 20 then raise exception 'Write a charter of at least a couple of sentences.' using errcode = 'P0001'; end if;
  update consultation_groups set charter_body = p_body where id = p_group returning charter_version into v;
  return v;
end;
$$;

create or replace function public.group_set_role(p_group bigint, p_member uuid, p_role text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from consultation_groups g where g.id = p_group and g.created_by = auth.uid()) then
    raise exception 'Only the person who started the group can appoint organizers.' using errcode = '42501';
  end if;
  if p_role not in ('coordinator', 'member') then raise exception 'Unknown role.' using errcode = 'P0001'; end if;
  perform set_config('pa.group_organiser_action', '1', true);
  update consultation_group_members set role = p_role where group_id = p_group and profile_id = p_member and status = 'joined' and role <> 'creator';
  if not found then raise exception 'That person is not a joined member.' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.group_remove_member(p_group bigint, p_member uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not private.group_is_organiser(p_group, auth.uid()) then raise exception 'Only the group''s organizers can remove a member.' using errcode = '42501'; end if;
  if exists (select 1 from consultation_groups g where g.id = p_group and g.created_by = p_member) then
    raise exception 'The person who started the group cannot be removed.' using errcode = 'P0001';
  end if;
  perform set_config('pa.group_organiser_action', '1', true);
  update consultation_group_members set status = 'removed', responded_at = now() where group_id = p_group and profile_id = p_member and status in ('joined', 'invited');
end;
$$;
