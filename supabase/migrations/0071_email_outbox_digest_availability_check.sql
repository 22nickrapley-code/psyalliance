-- Stage 5 (Product Spec v1, "Bring people back"): email delivery, the
-- weekly digest, the monthly one-click availability check, licence and
-- renewal reminders, and the 24-hour reminder for urgent cover requests.
--
-- Everything runs inside the database on a schedule (pg_cron), and email
-- goes out through the provider's HTTP API (pg_net). The app never needs
-- the service-role key. Nothing is sent until an email API key is stored
-- in Supabase Vault under the name 'email_api_key' (Nick's action):
--
--   select vault.create_secret('<API key>', 'email_api_key');
--
-- and the sender and site address are set in public.app_config.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------- config
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
-- No policies: only security-definer functions below read it.
insert into public.app_config (key, value) values
  ('site_url', 'https://psyalliance.org'),
  ('email_from', 'PsyAlliance <notifications@psyalliance.org>'),
  ('email_provider', 'resend')
on conflict (key) do nothing;

create or replace function private.cfg(k text)
returns text language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = k;
$$;

-- ------------------------------------------------------ outbox columns
alter table public.notification_deliveries
  add column if not exists send_after timestamptz not null default now(),
  add column if not exists provider_request_id bigint,
  add column if not exists attempted_at timestamptz;

alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status = any (array['pending','sent','failed','suppressed_dedup','suppressed_preference','suppressed_read','suppressed_demo']));

create index if not exists notification_deliveries_email_outbox_idx
  on public.notification_deliveries (send_after)
  where channel = 'email' and status = 'pending';

-- Unexpected-absence cover requests get a reminder after 24 hours.
alter table public.coverage_requests add column if not exists reminded_at timestamptz;

-- One-click monthly availability check (no login needed).
create table if not exists public.availability_check_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz
);
alter table public.availability_check_tokens enable row level security;
create index if not exists availability_check_tokens_profile_idx on public.availability_check_tokens(profile_id, created_at desc);

-- ------------------------------------------------------------- helpers
create or replace function private.html_escape(t text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

create or replace function private.display_name(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select trim(coalesce(credential_prefix || ' ', '') || coalesce(full_name, 'A colleague')) from profiles where id = p;
$$;

-- The shared email frame. Plain, readable, no tracking pixels.
create or replace function private.email_frame(body_html text, cta_text text, cta_link text, footer_note text)
returns text language sql stable as $$
  select
    '<div style="background:#f5f3ee;padding:28px 12px">'
    || '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e6df;border-radius:10px;padding:28px;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2a24;font-size:15px;line-height:1.55">'
    || '<p style="margin:0 0 18px;font-family:Georgia,serif;font-size:19px;color:#173c33">psyalliance</p>'
    || body_html
    || case when cta_link is not null then
         '<p style="margin:22px 0 6px"><a href="' || private.html_escape(cta_link) || '" style="display:inline-block;background:#173c33;color:#ffffff;padding:11px 18px;border-radius:7px;text-decoration:none;font-weight:600">' || private.html_escape(cta_text) || '</a></p>'
       else '' end
    || '<p style="margin:26px 0 0;padding-top:14px;border-top:1px solid #eceee9;font-size:12px;color:#6b776f">'
    || coalesce(footer_note, '')
    || ' Choose what we email you in <a href="' || private.html_escape(private.cfg('site_url') || '/dashboard/settings#notifications') || '" style="color:#24644d">Settings</a>.'
    || ' PsyAlliance never includes patient details in email.</p>'
    || '</div></div>';
$$;

-- Subject, HTML and text for one email delivery.
create or replace function private.render_email(d_id bigint)
returns table(subject text, html text, text_body text)
language plpgsql stable security definer set search_path = public as $$
declare
  e record;
  site text := coalesce(private.cfg('site_url'), '');
  actor text;
  line text;
  link text;
  cta text := 'Open in PsyAlliance';
  items jsonb;
  item jsonb;
  list_html text := '';
  list_text text := '';
begin
  select ev.* into e
  from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
  where nd.id = d_id;

  actor := case when e.actor_profile_id is not null then private.display_name(e.actor_profile_id) end;
  line := case when actor is not null then actor || ' ' || e.summary else e.summary end;
  link := site || coalesce(e.deep_link, '/dashboard');

  if e.event_type = 'weekly_digest' then
    items := coalesce(e.metadata -> 'lines', '[]'::jsonb);
    for item in select * from jsonb_array_elements(items) loop
      list_html := list_html || '<li style="margin:0 0 8px"><a href="' || private.html_escape(site || (item ->> 'link')) || '" style="color:#173c33">' || private.html_escape(item ->> 'text') || '</a></li>';
      list_text := list_text || '- ' || (item ->> 'text') || ': ' || site || (item ->> 'link') || E'\n';
    end loop;
    return query select
      'Your PsyAlliance week'::text,
      private.email_frame('<p style="margin:0 0 12px">Here&rsquo;s your week on PsyAlliance:</p><ul style="padding-left:18px;margin:0">' || list_html || '</ul>', 'Open PsyAlliance', site || '/dashboard', 'You get this weekly digest because it is switched on.'),
      'Your PsyAlliance week' || E'\n\n' || list_text || E'\nChange what we email you: ' || site || '/dashboard/settings#notifications';
    return;
  end if;

  if e.event_type = 'availability_reminder' and e.metadata ? 'token' then
    link := site || '/availability-check/' || (e.metadata ->> 'token');
    return query select
      'Ten seconds: is your availability still right?'::text,
      private.email_frame(
        '<p style="margin:0 0 10px">Colleagues rely on your availability when they refer or look for cover. It was last confirmed '
        || coalesce(e.metadata ->> 'age_label', 'a while ago') || '.</p>'
        || '<p style="margin:0">Confirm it, or change referrals, cover and consult, in one click. No sign-in needed.</p>',
        'Check my availability', link, 'This link works once and expires in 30 days.'),
      'Is your availability still right? Confirm or update it in one click, no sign-in needed: ' || link;
    return;
  end if;

  cta := case e.event_type
    when 'coverage_request' then 'See the cover request'
    when 'referral_sent' then 'See the referral'
    when 'referral_response' then 'See the reply'
    when 'referral_connected' then 'See the referral'
    when 'coverage_response' then 'See the reply'
    when 'coverage_confirmed' then 'See your cover plan'
    when 'consultation_response' then 'Read the reply'
    when 'consultation_invite' then 'See the question'
    when 'trusted_invitation_sent' then 'Review the invitation'
    when 'message_received' then 'Read the message'
    when 'credential_reminder' then 'Open Credentials'
    else 'Open in PsyAlliance' end;

  return query select
    left(line, 140),
    private.email_frame('<p style="margin:0">' || private.html_escape(line) || '.</p>', cta, link, null),
    line || '.' || E'\n\n' || cta || ': ' || link;
end;
$$;

-- ----------------------------------------------------------- dispatcher
-- Sends due email deliveries through the provider API. Leaves them
-- pending when no key is configured (and fails anything over 3 days old,
-- so switching email on later doesn't flood members with stale news).
create or replace function public.dispatch_email_outbox(batch_size int default 50)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text;
  provider text := coalesce(private.cfg('email_provider'), 'resend');
  sender text := private.cfg('email_from');
  r record;
  msg record;
  req_id bigint;
  sent int := 0;
begin
  update notification_deliveries set status = 'failed', error = 'Not sent: email was not switched on within 3 days'
  where channel = 'email' and status = 'pending' and created_at < now() - interval '3 days';

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'email_api_key' limit 1;
  if api_key is null or sender is null then
    return 0;
  end if;

  for r in
    select nd.id, nd.recipient_profile_id, ev.event_type, ev.created_at as event_at, ev.metadata,
           u.email, p.is_demo, p.account_status
    from notification_deliveries nd
    join notification_events ev on ev.id = nd.notification_event_id
    join profiles p on p.id = nd.recipient_profile_id
    left join auth.users u on u.id = nd.recipient_profile_id
    where nd.channel = 'email' and nd.status = 'pending' and nd.send_after <= now()
    order by nd.send_after
    limit batch_size
    for update of nd skip locked
  loop
    -- Never email demo accounts or anyone without an address.
    if r.is_demo or r.email is null or r.email ilike '%.test' or r.account_status <> 'active' then
      update notification_deliveries set status = 'suppressed_demo', attempted_at = now() where id = r.id;
      continue;
    end if;
    -- Respect the recipient's email switches (checked here because the
    -- sender can't read them under RLS). private.email_pref_allows is
    -- defined in 0072.
    if not private.email_pref_allows(r.recipient_profile_id, r.event_type) then
      update notification_deliveries set status = 'suppressed_preference', attempted_at = now() where id = r.id;
      continue;
    end if;
    -- "New message" emails only go if still unread after an hour.
    if r.event_type = 'message_received' and exists (
      select 1 from conversation_participants cp
      where cp.profile_id = r.recipient_profile_id
        and cp.conversation_id = nullif(r.metadata ->> 'conversationId', '')::bigint
        and cp.last_read_at >= r.event_at
    ) then
      update notification_deliveries set status = 'suppressed_read', attempted_at = now() where id = r.id;
      continue;
    end if;

    select * into msg from private.render_email(r.id);

    if provider = 'postmark' then
      select net.http_post(
        url := 'https://api.postmarkapp.com/email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json', 'X-Postmark-Server-Token', api_key),
        body := jsonb_build_object('From', sender, 'To', r.email, 'Subject', msg.subject, 'HtmlBody', msg.html, 'TextBody', msg.text_body, 'MessageStream', 'outbound')
      ) into req_id;
    else
      select net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key),
        body := jsonb_build_object('from', sender, 'to', jsonb_build_array(r.email), 'subject', msg.subject, 'html', msg.html, 'text', msg.text_body)
      ) into req_id;
    end if;

    update notification_deliveries
    set status = 'sent', delivered_at = now(), attempted_at = now(), provider_request_id = req_id
    where id = r.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- Marks sends the provider rejected as failed, with the reason.
create or replace function public.reconcile_email_outbox()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  update notification_deliveries nd
  set status = 'failed', error = left(coalesce(resp.content, resp.error_msg, 'HTTP ' || resp.status_code), 500)
  from net._http_response resp
  where nd.provider_request_id = resp.id
    and nd.status = 'sent'
    and (resp.status_code is null or resp.status_code >= 300);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- --------------------------------------------------- scheduled builders
create or replace function private.real_members()
returns table(id uuid)
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where not p.is_demo and p.verification_status = 'verified' and p.account_status = 'active';
$$;

-- Weekly digest: one email with every line linking straight to the action.
create or replace function public.queue_weekly_digests()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  m record;
  lines jsonb;
  n_ref int; n_cover int; n_disc int; n_wait int; top_tag text; age int;
  ev_id bigint;
  queued int := 0;
begin
  for m in
    select p.id, p.availability_confirmed_at, coalesce(np.digest_frequency, 'weekly') as freq
    from profiles p
    join private.real_members() rm on rm.id = p.id
    left join notification_preferences np on np.profile_id = p.id
  loop
    continue when m.freq = 'off';
    continue when m.freq = 'fortnightly' and (extract(week from now())::int % 2) = 1;
    -- Not twice in six days.
    continue when exists (
      select 1 from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
      where nd.recipient_profile_id = m.id and ev.event_type = 'weekly_digest' and nd.created_at > now() - interval '6 days'
    );

    select count(*) into n_ref from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
      where nd.recipient_profile_id = m.id and nd.channel = 'in_app' and ev.event_type = 'referral_sent' and nd.created_at > now() - interval '7 days';
    select count(*) into n_cover from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
      where nd.recipient_profile_id = m.id and nd.channel = 'in_app' and ev.event_type = 'coverage_request' and nd.created_at > now() - interval '7 days';
    select count(*), min(t.tag) into n_disc, top_tag
      from consultations c
      join consult_tag_follows t on t.profile_id = m.id and t.tag = any (c.tags)
      where c.audience_type = 'wider_network' and c.status <> 'draft' and c.author_profile_id <> m.id
        and c.created_at > now() - interval '7 days';
    select count(*) into n_wait from notification_deliveries
      where recipient_profile_id = m.id and channel = 'in_app' and read_at is null and created_at > now() - interval '30 days';
    age := case when m.availability_confirmed_at is null then null else extract(day from now() - m.availability_confirmed_at)::int end;

    lines := '[]'::jsonb;
    if n_ref > 0 then lines := lines || jsonb_build_object('text', n_ref || ' referral need' || case when n_ref = 1 then '' else 's' end || ' matched your profile', 'link', '/dashboard/refer'); end if;
    if n_cover > 0 then lines := lines || jsonb_build_object('text', n_cover || ' colleague' || case when n_cover = 1 then ' is' else 's are' end || ' looking for your cover', 'link', '/dashboard/cover'); end if;
    if n_disc > 0 then lines := lines || jsonb_build_object('text', n_disc || ' discussion' || case when n_disc = 1 then '' else 's' end || ' in ' || top_tag || ' you might want to see', 'link', '/dashboard/consult'); end if;
    if age is null or age >= 30 then lines := lines || jsonb_build_object('text', case when age is null then 'Your availability has never been confirmed. Confirm it' else 'Your availability is ' || age || ' days old. Confirm it' end, 'link', '/dashboard/availability'); end if;
    if n_wait > 0 then lines := lines || jsonb_build_object('text', n_wait || ' thing' || case when n_wait = 1 then '' else 's' end || ' waiting on you', 'link', '/dashboard'); end if;

    continue when jsonb_array_length(lines) = 0;

    insert into notification_events (event_type, actor_type, summary, deep_link, metadata, dedup_key)
    values ('weekly_digest', 'system', 'Your PsyAlliance week', '/dashboard', jsonb_build_object('lines', lines), 'digest:' || m.id || ':' || to_char(now(), 'IYYY-IW'))
    returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status)
    values (ev_id, m.id, 'email', 'pending');
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

-- Monthly availability check: members whose availability is 30+ days old
-- (or never confirmed) get a one-click link, at most once every 25 days.
create or replace function public.queue_availability_checks()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  m record;
  tok text;
  ev_id bigint;
  age_label text;
  wants_email boolean;
  queued int := 0;
begin
  for m in
    select p.id, p.availability_confirmed_at, np.email_on_availability_reminder
    from profiles p
    join private.real_members() rm on rm.id = p.id
    left join notification_preferences np on np.profile_id = p.id
    where p.availability_confirmed_at is null or p.availability_confirmed_at < now() - interval '30 days'
  loop
    continue when exists (select 1 from availability_check_tokens t where t.profile_id = m.id and t.created_at > now() - interval '25 days');
    tok := encode(gen_random_bytes(24), 'hex');
    insert into availability_check_tokens (token, profile_id) values (tok, m.id);
    age_label := case when m.availability_confirmed_at is null then 'never' else extract(day from now() - m.availability_confirmed_at)::int || ' days ago' end;
    insert into notification_events (event_type, actor_type, summary, deep_link, metadata, dedup_key)
    values ('availability_reminder', 'system', 'Your availability was last confirmed ' || age_label || '. Is it still right?', '/dashboard/availability',
            jsonb_build_object('token', tok, 'age_label', age_label), 'availability:' || m.id || ':' || to_char(now(), 'YYYY-MM'))
    returning id into ev_id;
    wants_email := coalesce(m.email_on_availability_reminder, true);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at)
    values (ev_id, m.id, 'in_app', 'sent', now());
    if wants_email then
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status)
      values (ev_id, m.id, 'email', 'pending');
    end if;
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

-- Licence, malpractice and CAQH reminders at 90, 30 and 7 days.
create or replace function public.queue_credential_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  ev_id bigint;
  queued int := 0;
begin
  for r in
    select l.profile_id, 'licence:' || l.id || ':' || (l.expiration_date - current_date) as dkey,
           'Your ' || l.state || ' licence expires in ' || (l.expiration_date - current_date) || ' days. Renew it and update Credentials to stay listed there.' as summary,
           (l.expiration_date - current_date) <= 7 as urgent
    from licenses l join private.real_members() rm on rm.id = l.profile_id
    where l.status = 'active' and (l.expiration_date - current_date) in (90, 30, 7)
    union all
    select p.id, 'malpractice:' || p.id || ':' || (p.malpractice_expires - current_date),
           'Your malpractice insurance renews in ' || (p.malpractice_expires - current_date) || ' days.', false
    from profiles p join private.real_members() rm on rm.id = p.id
    where (p.malpractice_expires - current_date) in (90, 30, 7)
    union all
    select p.id, 'caqh:' || p.id || ':' || ((p.caqh_last_attested_date + 120) - current_date),
           'Your CAQH re-attestation is due in ' || ((p.caqh_last_attested_date + 120) - current_date) || ' days.', false
    from profiles p join private.real_members() rm on rm.id = p.id
    where ((p.caqh_last_attested_date + 120) - current_date) in (30, 7)
  loop
    continue when exists (select 1 from notification_events where dedup_key = r.dkey);
    insert into notification_events (event_type, actor_type, summary, deep_link, dedup_key, metadata)
    values ('credential_reminder', 'system', r.summary, '/dashboard/credentials', r.dkey, jsonb_build_object('urgent', r.urgent))
    returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at)
    values (ev_id, r.profile_id, 'in_app', 'sent', now());
    if coalesce((select email_on_credential_reminder from notification_preferences where profile_id = r.profile_id), true) then
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status)
      values (ev_id, r.profile_id, 'email', 'pending');
    end if;
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

-- Unexpected-absence cover requests still unanswered after 24 hours get
-- one reminder.
create or replace function public.queue_urgent_cover_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  ev_id bigint;
  queued int := 0;
begin
  for r in
    select cr.id, cr.requested_profile_id, cp.profile_id as owner
    from coverage_requests cr
    join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
    join coverage_plans cp on cp.id = c.coverage_plan_id
    where cr.status = 'sent' and cr.reminded_at is null
      and cp.absence_type = 'unexpected'
      and cr.sent_at < now() - interval '24 hours'
  loop
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, dedup_key, metadata)
    values ('coverage_request', r.owner, 'system', 'is still looking for urgent cover and hasn''t heard back', '/dashboard/cover',
            'cover_reminder:' || r.id, jsonb_build_object('coverageRequestId', r.id, 'reminder', true))
    returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at)
    values (ev_id, r.requested_profile_id, 'in_app', 'sent', now());
    if coalesce((select email_on_coverage_request from notification_preferences where profile_id = r.requested_profile_id), true) then
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status)
      values (ev_id, r.requested_profile_id, 'email', 'pending');
    end if;
    update coverage_requests set reminded_at = now() where id = r.id;
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

-- --------------------------------------------- one-click availability
-- Called from the public /availability-check/[token] page without a
-- session. The token is the only credential; it expires after 30 days
-- and is spent by a confirm.
create or replace function public.availability_check_read(p_token text)
returns table(first_name text, referral text, cover text, consult text, confirmed_at timestamptz, valid boolean, used boolean)
language sql stable security definer set search_path = public as $$
  select split_part(coalesce(p.full_name, ''), ' ', 1),
         p.referral_availability, p.coverage_availability, p.consultation_availability, p.availability_confirmed_at,
         t.expires_at > now(), t.used_at is not null
  from availability_check_tokens t join profiles p on p.id = t.profile_id
  where t.token = p_token;
$$;

create or replace function public.availability_check_apply(p_token text, p_referral text, p_cover text, p_consult text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select profile_id into pid from availability_check_tokens
  where token = p_token and expires_at > now() and used_at is null;
  if pid is null then return false; end if;
  if p_referral not in ('yes', 'limited', 'no') or p_cover not in ('yes', 'ask_me', 'no') or p_consult not in ('yes', 'no') then
    return false;
  end if;
  update profiles set
    referral_availability = p_referral,
    coverage_availability = p_cover,
    consultation_availability = p_consult,
    accepting_referrals = (p_referral = 'yes' and (availability_paused_until is null or availability_paused_until < current_date)),
    availability_confirmed_at = now()
  where id = pid;
  update availability_check_tokens set used_at = now() where token = p_token;
  return true;
end;
$$;

revoke all on function public.availability_check_read(text) from public;
revoke all on function public.availability_check_apply(text, text, text, text) from public;
grant execute on function public.availability_check_read(text) to anon, authenticated;
grant execute on function public.availability_check_apply(text, text, text, text) to anon, authenticated;

-- The scheduled functions are not callable by members.
revoke all on function public.dispatch_email_outbox(int) from public, anon, authenticated;
revoke all on function public.reconcile_email_outbox() from public, anon, authenticated;
revoke all on function public.queue_weekly_digests() from public, anon, authenticated;
revoke all on function public.queue_availability_checks() from public, anon, authenticated;
revoke all on function public.queue_credential_reminders() from public, anon, authenticated;
revoke all on function public.queue_urgent_cover_reminders() from public, anon, authenticated;

-- -------------------------------------------------------------- schedule
-- Times in UTC. Digest: Mondays 13:00 UTC (8 or 9am US Eastern).
select cron.unschedule(jobname) from cron.job where jobname like 'pa_%';
select cron.schedule('pa_email_dispatch', '* * * * *', 'select public.dispatch_email_outbox()');
select cron.schedule('pa_email_reconcile', '*/5 * * * *', 'select public.reconcile_email_outbox()');
select cron.schedule('pa_weekly_digest', '0 13 * * 1', 'select public.queue_weekly_digests()');
select cron.schedule('pa_availability_check', '0 14 * * *', 'select public.queue_availability_checks()');
select cron.schedule('pa_credential_reminders', '30 13 * * *', 'select public.queue_credential_reminders()');
select cron.schedule('pa_urgent_cover_reminders', '15 * * * *', 'select public.queue_urgent_cover_reminders()');
