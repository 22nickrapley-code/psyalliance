-- v17: phone alerts. A test alert a member can send to their own phone; alerts for new messages.
-- Safe to run twice.

-- 1. Alert wording, now also for messages and for the test alert.
create or replace function private.alert_text(p_event_type text, p_actor uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when p_event_type = 'system_notice' then 'Test alert from PsyAlliance. Alerts are working on this phone.'
    else coalesce(nullif(split_part(coalesce(private.member_name(p_actor), ''), ' ', 1), ''), 'A colleague') || ' ' ||
      case p_event_type
        when 'coverage_request' then 'has sent you a Cover request. Review request.'
        when 'coverage_response' then 'has replied to your Cover request. Review reply.'
        when 'coverage_confirmed' then 'has replied to your Cover request. Review reply.'
        when 'referral_sent' then 'has sent you a referral request. Review request.'
        when 'referral_response' then 'has replied to your referral. Review reply.'
        when 'referral_connected' then 'has replied to your referral. Review reply.'
        when 'consultation_invite' then 'has asked you a question. Review question.'
        when 'message_received' then 'has sent you a message. Open message.'
        else 'has replied to your question. Review reply.' end
  end;
$$;
revoke all on function private.alert_text(text, uuid) from public, anon, authenticated;

-- 2. New messages also go to the phone (once per conversation until it is read).
create or replace function private.fan_out_phone_alerts()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ev record; mp record;
begin
  if new.channel <> 'in_app' then return new; end if;
  select event_type, actor_profile_id into ev from notification_events where id = new.notification_event_id;
  if ev.event_type not in ('coverage_request', 'coverage_response', 'coverage_confirmed', 'referral_sent', 'referral_response', 'referral_connected', 'consultation_invite', 'consultation_response', 'message_received') then
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

-- 3. Message notices: a later message notifies again once the earlier one has been read (body otherwise as 0119).
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
  if private.is_sandbox_colleague(p_recipient) then
    return;
  end if;
  if p_dedup is not null and exists (
    select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id
     where e.dedup_key = p_dedup and d.recipient_profile_id = p_recipient and d.status in ('pending', 'sent')
       -- v17: a new message notifies again once the earlier notice for that conversation has been read.
       and (p_type <> 'message_received' or (d.channel = 'in_app' and d.read_at is null))
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

-- 4. The sender: unchanged from 0127 except that a requested test alert also goes to sandbox accounts.
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
           coalesce(ev.metadata ->> 'test', '') = 'true' as is_test,
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
    -- v17: a test alert the member asked for is sent even in the sandbox.
    if (r.is_demo and not r.is_test) or r.account_status <> 'active' then
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

-- 5. "Send me a test alert": one push to the member's own devices, at most one a minute. Ignores quiet hours.
create or replace function public.send_test_alert()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); ev bigint;
begin
  if me is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if not exists (select 1 from push_subscriptions where profile_id = me and revoked_at is null)
     or not coalesce((select alert_push from member_participation where profile_id = me), false) then
    return jsonb_build_object('ok', false, 'error', 'Turn on alerts on this device first.');
  end if;
  if exists (select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id
              where d.recipient_profile_id = me and d.channel = 'push' and e.dedup_key = 'test_alert:' || me
                and d.created_at > now() - interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'A test alert is already on its way. Please wait a minute.');
  end if;
  insert into notification_events (event_type, actor_type, dedup_key, deep_link, summary, metadata)
  values ('system_notice', 'system', 'test_alert:' || me, '/dashboard/settings#alerts', 'Test alert', jsonb_build_object('test', true))
  returning id into ev;
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, send_after)
  values (ev, me, 'push', 'pending', now());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.send_test_alert() from public, anon;
grant execute on function public.send_test_alert() to authenticated;
