-- Notification events were readable by every signed-in member. They carry
-- summaries and, since 0071, one-click availability tokens, so a member
-- now sees only events addressed to them or raised by them.
drop policy if exists "notification events are readable network-wide" on public.notification_events;
drop policy if exists "recipients and actors read notification events" on public.notification_events;
create policy "recipients and actors read notification events" on public.notification_events
  for select using (
    actor_profile_id = (select auth.uid())
    or exists (
      select 1 from public.notification_deliveries d
      where d.notification_event_id = notification_events.id
        and d.recipient_profile_id = (select auth.uid())
    )
  );

-- Dedup needs to see other recipients' recent deliveries, which RLS hides
-- from the sender. This answers only "which of these were notified about
-- this key recently", nothing else.
create or replace function public.recently_notified(p_dedup_key text, p_recipients uuid[], p_hours int default 24)
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d.recipient_profile_id), '{}')
  from notification_deliveries d
  join notification_events e on e.id = d.notification_event_id
  where e.dedup_key = p_dedup_key
    and d.recipient_profile_id = any (p_recipients)
    and d.status in ('pending', 'sent')
    and d.created_at > now() - make_interval(hours => p_hours)
    and auth.uid() is not null;
$$;
revoke all on function public.recently_notified(text, uuid[], int) from public, anon;
grant execute on function public.recently_notified(text, uuid[], int) to authenticated;

-- Email preferences are owner-only under RLS, so the sender can't see a
-- recipient's choices. The dispatcher checks them at send time instead.
-- (Applied live as migration "email_preference_check_at_send": adds
-- private.email_pref_allows(profile, event_type) and a dispatch_email_outbox
-- that marks opted-out deliveries 'suppressed_preference'.)
create or replace function private.email_pref_allows(p uuid, t text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case t
      when 'coverage_request' then np.email_on_coverage_request
      when 'coverage_response' then np.email_on_coverage_response
      when 'coverage_confirmed' then np.email_on_coverage_response
      when 'referral_sent' then np.email_on_referral_request
      when 'referral_response' then np.email_on_referral_response
      when 'referral_connected' then np.email_on_referral_response
      when 'consultation_response' then np.email_on_consultation_response
      when 'consultation_invite' then np.email_on_consultation_invite
      when 'trusted_invitation_sent' then np.email_on_trusted_invitation
      when 'trusted_invitation_accepted' then np.email_on_trusted_invitation
      when 'credential_reminder' then np.email_on_credential_reminder
      when 'availability_reminder' then np.email_on_availability_reminder
      when 'message_received' then np.email_on_message
      when 'weekly_digest' then np.digest_frequency <> 'off'
      else true end
    from notification_preferences np where np.profile_id = p
  ), true);
$$;

-- pg_cron keeps a row per run (the dispatcher runs every minute); keep a
-- week of history.
select cron.schedule('pa_cron_history_cleanup', '0 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- Admin overview: is email switched on and working?
create or replace function public.admin_email_health()
returns table(configured boolean, sent_7d bigint, failed_7d bigint, pending bigint, last_error text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select
    exists (select 1 from vault.decrypted_secrets where name = 'email_api_key'),
    (select count(*) from notification_deliveries where channel = 'email' and status = 'sent' and delivered_at > now() - interval '7 days'),
    (select count(*) from notification_deliveries where channel = 'email' and status = 'failed' and created_at > now() - interval '7 days'),
    (select count(*) from notification_deliveries where channel = 'email' and status = 'pending'),
    (select error from notification_deliveries where channel = 'email' and status = 'failed' order by created_at desc limit 1);
end;
$$;
revoke all on function public.admin_email_health() from public, anon;
grant execute on function public.admin_email_health() to authenticated;
