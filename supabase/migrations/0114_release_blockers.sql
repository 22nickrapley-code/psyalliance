-- 0114: release blockers from the 16 October release review.
--
--   N16-02  one winner: a cover case can be accepted once; a referral can
--           have one chosen colleague. Enforced in the database, for the
--           app's path (functions that lock first) and for direct calls
--           (guards on the tables).
--   N16-03  notifications: the event and its deliveries are written in one
--           transaction, with every column given (raise_notification).
--   N16-01  "Every two weeks" is a valid digest setting, and the digest
--           honours it (at most once in 13 days, covering 14 days).
--   N01     marking a reply useful: only the question's author, and the
--           saved value is returned.
--   R04     erasure: an account can't be deleted while its stored files
--           remain, so a direct call can't orphan them.
--   parity  guard_licence_review and the planner cleanup as they already are
--           on both hosted projects, so a fresh database matches them.
--
-- Safe to run more than once. Run on the real project and the sandbox
-- project, then the parity check at the bottom.

-- ------------------------------------------------------------------ N16-02 cover
-- Every answer to a cover request about one client is serialised on the
-- client's row. A request can only be answered while it is open, the plan
-- is live and nobody else has taken the client on.
create or replace function public.guard_cover_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_status text;
  v_taken boolean;
begin
  if new.status is not distinct from old.status or new.status not in ('accepted', 'discussing', 'declined') then
    return new;
  end if;
  select p.status::text into v_plan_status
  from coverage_plan_cases c join coverage_plans p on p.id = c.coverage_plan_id
  where c.id = new.coverage_plan_case_id
  for update of c;
  select exists (
    select 1 from coverage_requests r
    where r.coverage_plan_case_id = new.coverage_plan_case_id and r.status = 'accepted' and r.id <> new.id
  ) into v_taken;
  -- Scheduled jobs (no signed-in member) skip a closed request quietly
  -- instead of failing the whole run; members get the reason.
  if auth.uid() is null or current_setting('pa.seeding', true) = 'on' then
    if v_plan_status in ('cancelled', 'completed') or old.status not in ('sent', 'discussing') or (new.status = 'accepted' and v_taken) then
      return null;
    end if;
    return new;
  end if;
  if v_plan_status in ('cancelled', 'completed') then
    raise exception 'This cover plan has ended, so the request is closed.' using errcode = 'P0001';
  end if;
  if old.status not in ('sent', 'discussing') then
    raise exception 'This request is closed. The colleague may have found cover elsewhere.' using errcode = 'P0001';
  end if;
  if new.status = 'accepted' and v_taken then
    raise exception 'Another colleague has already taken on this client, so it''s covered. Thank you for offering.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_cover_acceptance on public.coverage_requests;
create trigger guard_cover_acceptance
  before update of status on public.coverage_requests
  for each row execute function public.guard_cover_acceptance();

-- Once someone accepts, the other open requests for that client close, so
-- nobody is left being asked about a covered client.
create or replace function public.settle_cover_siblings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update coverage_requests
    set status = 'expired', responded_at = coalesce(responded_at, now())
    where coverage_plan_case_id = new.coverage_plan_case_id
      and id <> new.id
      and status in ('sent', 'discussing');
  end if;
  return new;
end;
$$;

drop trigger if exists settle_cover_siblings on public.coverage_requests;
create trigger settle_cover_siblings
  after update of status on public.coverage_requests
  for each row execute function public.settle_cover_siblings();

-- The app's path: lock the client first, then answer. Concurrent answers
-- queue on the lock and the later one gets a clear "already covered".
create or replace function public.respond_to_cover_request(p_request bigint, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_req coverage_requests%rowtype;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_response not in ('accepted', 'declined', 'discussing') then
    raise exception 'Choose a response.' using errcode = 'P0001';
  end if;
  select * into v_req from coverage_requests where id = p_request;
  if not found or v_req.requested_profile_id <> me then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  perform 1 from coverage_plan_cases where id = v_req.coverage_plan_case_id for update;
  select * into v_req from coverage_requests where id = p_request;
  if v_req.status::text = p_response then
    return jsonb_build_object('status', v_req.status, 'unchanged', true);
  end if;
  update coverage_requests set status = p_response::coverage_request_status, responded_at = now() where id = p_request;
  return jsonb_build_object('status', p_response, 'unchanged', false);
end;
$$;

revoke all on function public.respond_to_cover_request(bigint, text) from public, anon;
grant execute on function public.respond_to_cover_request(bigint, text) to authenticated;

-- ------------------------------------------------------------------ N16-02 referral
-- One chosen colleague per referral, for direct calls too.
create or replace function public.guard_referral_single_choice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_other uuid;
begin
  if new.status <> 'accepted' or old.status = 'accepted' or current_setting('pa.seeding', true) = 'on' then
    return new;
  end if;
  perform 1 from referral_requests where id = new.referral_request_id for update;
  select responding_profile_id into v_other from referral_responses
  where referral_request_id = new.referral_request_id and status = 'accepted' and id <> new.id
  limit 1;
  if v_other is not null then
    raise exception 'You''ve already chosen % for this referral.', private.display_name(v_other) using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_referral_single_choice on public.referral_responses;
create trigger guard_referral_single_choice
  before update of status on public.referral_responses
  for each row execute function public.guard_referral_single_choice();

-- The app's path: one transaction, the referral locked first.
create or replace function public.choose_referral_colleague(p_referral bigint, p_colleague uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  v_reply text;
  v_other uuid;
begin
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id is distinct from me then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if r.status = 'closed' then
    raise exception 'This referral is closed.' using errcode = 'P0001';
  end if;
  if r.audience_type = 'selected' and not (p_colleague = any (r.audience_profile_ids)) then
    raise exception 'You can only choose a colleague you sent this referral to.' using errcode = 'P0001';
  end if;
  select status into v_reply from referral_responses where referral_request_id = p_referral and responding_profile_id = p_colleague;
  if v_reply is null or v_reply not in ('interested', 'accepted') then
    raise exception 'Choose a colleague who replied Interested.' using errcode = 'P0001';
  end if;
  select responding_profile_id into v_other from referral_responses
  where referral_request_id = p_referral and status = 'accepted' and responding_profile_id <> p_colleague
  limit 1;
  if v_other is not null then
    raise exception 'You''ve already chosen % for this referral.', private.display_name(v_other) using errcode = 'P0001';
  end if;
  if v_reply = 'accepted' then
    return jsonb_build_object('already', true);
  end if;
  update referral_responses set status = 'accepted', responded_at = now()
  where referral_request_id = p_referral and responding_profile_id = p_colleague;
  update referral_requests set status = 'connected' where id = p_referral;
  return jsonb_build_object('already', false);
end;
$$;

revoke all on function public.choose_referral_colleague(bigint, uuid) from public, anon;
grant execute on function public.choose_referral_colleague(bigint, uuid) to authenticated;

-- ------------------------------------------------------------------ N16-03
-- One call writes the event and its deliveries together, with the caller's
-- own permissions (the existing insert policies still decide who may tell
-- whom). If any delivery is refused, nothing is written.
create or replace function public.raise_notification(
  p_event_type text,
  p_summary text,
  p_deep_link text,
  p_dedup_key text,
  p_metadata jsonb,
  p_actor_type text,
  p_deliveries jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare ev bigint;
begin
  insert into notification_events (event_type, actor_profile_id, actor_type, dedup_key, deep_link, summary, metadata)
  values (p_event_type, auth.uid(), coalesce(p_actor_type, 'system')::public.actor_type, p_dedup_key, p_deep_link, p_summary, coalesce(p_metadata, '{}'::jsonb))
  returning id into ev;
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at, send_after)
  select ev,
         (d ->> 'recipient')::uuid,
         d ->> 'channel',
         d ->> 'status',
         nullif(d ->> 'delivered_at', '')::timestamptz,
         coalesce(nullif(d ->> 'send_after', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_deliveries, '[]'::jsonb)) d;
  return ev;
end;
$$;

revoke all on function public.raise_notification(text, text, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.raise_notification(text, text, text, text, jsonb, text, jsonb) to authenticated;

-- ------------------------------------------------------------------ N16-01
alter table public.notification_preferences drop constraint if exists valid_digest_frequency;
alter table public.notification_preferences add constraint valid_digest_frequency
  check (digest_frequency in ('realtime', 'daily', 'weekly', 'fortnightly', 'off'));

create or replace function public.queue_weekly_digests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  lines jsonb;
  n_ref int; n_cover int; n_disc int; n_wait int; top_tag text; age int;
  ev_id bigint;
  queued int := 0;
  span interval;
begin
  for m in
    select p.id, p.availability_confirmed_at, coalesce(np.digest_frequency, 'weekly') as freq
    from profiles p
    join private.real_members() rm on rm.id = p.id
    left join notification_preferences np on np.profile_id = p.id
  loop
    continue when m.freq = 'off';
    -- Weekly: not twice in six days, covering seven. Every two weeks: not
    -- twice in thirteen days, covering fourteen.
    span := case when m.freq = 'fortnightly' then interval '14 days' else interval '7 days' end;
    continue when exists (
      select 1 from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
      where nd.recipient_profile_id = m.id and ev.event_type = 'weekly_digest'
        and nd.created_at > now() - (span - interval '1 day')
    );

    select count(*) into n_ref from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
      where nd.recipient_profile_id = m.id and nd.channel = 'in_app' and ev.event_type = 'referral_sent' and nd.created_at > now() - span;
    select count(*) into n_cover from notification_deliveries nd join notification_events ev on ev.id = nd.notification_event_id
      where nd.recipient_profile_id = m.id and nd.channel = 'in_app' and ev.event_type = 'coverage_request' and nd.created_at > now() - span;
    select count(*), min(t.tag) into n_disc, top_tag
      from consultations c
      join consult_tag_follows t on t.profile_id = m.id and t.tag = any (c.tags)
      where c.audience_type = 'wider_network' and c.status <> 'draft' and c.author_profile_id <> m.id
        and c.created_at > now() - span;
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
    values ('weekly_digest', 'system', case when m.freq = 'fortnightly' then 'Your PsyAlliance fortnight' else 'Your PsyAlliance week' end,
            '/dashboard', jsonb_build_object('lines', lines, 'frequency', m.freq), 'digest:' || m.id || ':' || to_char(now(), 'IYYY-IW'))
    returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, send_after)
    values (ev_id, m.id, 'email', 'pending', now());
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

-- ------------------------------------------------------------------ N01
create or replace function public.set_response_useful(p_response bigint, p_useful boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_author uuid;
  v_saved boolean;
begin
  select c.author_profile_id into v_author
  from consultation_responses r join consultations c on c.id = r.consultation_id
  where r.id = p_response;
  if v_author is null then
    raise exception 'Reply not found.' using errcode = 'P0001';
  end if;
  if v_author is distinct from me then
    raise exception 'Only the colleague who asked can mark a reply useful.' using errcode = 'P0001';
  end if;
  update consultation_responses set marked_useful = coalesce(p_useful, false) where id = p_response
  returning marked_useful into v_saved;
  return v_saved;
end;
$$;

revoke all on function public.set_response_useful(bigint, boolean) from public, anon;
grant execute on function public.set_response_useful(bigint, boolean) to authenticated;

-- ------------------------------------------------------------------ R04
-- Files first, then the account. The app removes the member's stored files
-- through Storage (which deletes the bytes) and then calls this; a direct
-- call while files remain is refused, so no file is left without an owner.
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE in capitals to confirm.' using errcode = 'P0001';
  end if;
  if private.is_admin_user(me) or exists (select 1 from profiles where id = me and account_kind = 'operator') then
    raise exception 'Admin accounts can''t be deleted from here.' using errcode = 'P0001';
  end if;
  if private.is_sandbox_guest(me) then
    raise exception 'Sandbox accounts end on their own. Use Reset to start again.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from storage.objects o
    where (o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = me::text)
       or (o.bucket_id = 'documents' and (storage.foldername(o.name))[1] = 'personal' and (storage.foldername(o.name))[2] = me::text)
  ) then
    raise exception 'Your stored files must be removed first. Delete your account from Settings, which removes them for you.' using errcode = 'P0001';
  end if;
  delete from documents where uploaded_by = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ------------------------------------------------------------------ parity
-- Already this way on both hosted projects; a database built from this
-- folder missed it because an earlier migration patched the text with
-- replace(), which silently skips when the text differs.
create or replace function public.guard_licence_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := private.is_admin_user(auth.uid());
begin
  if auth.uid() is null then
    return new;
  end if;
  if current_setting('pa.seeding', true) = 'on' and coalesce(private.cfg('app_env'), '') = 'demo' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not is_admin then
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
    return new;
  end if;
  if not is_admin then
    if new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by then
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
    end if;
    if new.state is distinct from old.state
       or new.license_number is distinct from old.license_number
       or new.expiration_date is distinct from old.expiration_date then
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------ sandbox
-- The sandbox's fictional colleagues answer cover requests on a schedule.
-- With one winner per client, a colleague whose client was already taken
-- is skipped instead of "accepting" it too. Otherwise exactly as deployed
-- on both projects today.
create or replace function private.demo_autorespond()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  r record; acted int := 0; ev bigint; responder uuid; conv bigint;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return 0;
  end if;

  for r in
    select cr.id, cr.requested_profile_id, pl.profile_id as owner, pl.id as plan_id, pl.title
    from coverage_requests cr
    join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
    join coverage_plans pl on pl.id = c.coverage_plan_id
    where cr.status = 'sent' and cr.sent_at < now() - interval '1 minute'
      and private.is_sandbox_guest(pl.profile_id) and not private.is_sandbox_guest(cr.requested_profile_id)
  loop
    update coverage_requests set status = (case when random() < 0.75 then 'accepted' else 'declined' end)::coverage_request_status, responded_at = now()
    where id = r.id and status = 'sent';
    continue when not found;
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_response', r.requested_profile_id, 'member_web', 'replied to your cover request', '/dashboard/cover/' || r.plan_id || '?step=track', '{"demo":true}')
    returning id into ev;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev, r.owner, 'in_app', 'sent', now());
    acted := acted + 1;
  end loop;

  for r in
    select rr.id, rr.requesting_profile_id as owner, rr.state, rr.audience_type, rr.audience_profile_ids
    from referral_requests rr
    where private.is_sandbox_guest(rr.requesting_profile_id) and rr.status in ('open', 'sent')
      and rr.created_at < now() - interval '1 minute'
      and not exists (select 1 from referral_responses x where x.referral_request_id = rr.id)
  loop
    for responder in
      select p.id from profiles p
      where p.is_demo and not private.is_sandbox_guest(p.id)
        and case
          when r.audience_type = 'selected' then p.id = any(coalesce(r.audience_profile_ids, '{}'::uuid[]))
          when r.audience_type = 'trusted' then p.referral_availability in ('yes', 'limited') and exists (select 1 from trusted_colleagues t where t.profile_id = r.owner and t.colleague_id = p.id)
          else p.referral_availability in ('yes', 'limited') and (r.state is null or p.primary_state = r.state)
        end
      order by random() limit 2
    loop
      insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
      values (r.id, responder, 'interested',
        (array['I have an opening next week and this is squarely in my area. Happy to talk first.',
               'I could take this. Virtual or in person works; I can do a brief call with you beforehand.',
               'Interested. I have two slots in the evenings from the start of next month.'])[1 + floor(random() * 3)::int],
        now(), now());
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('referral_response', responder, 'member_web', 'responded "interested" to your referral request', '/dashboard/refer/' || r.id, '{"demo":true}')
      returning id into ev;
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev, r.owner, 'in_app', 'sent', now());
    end loop;
    acted := acted + 1;
  end loop;

  for r in
    select c.id, c.author_profile_id as owner, c.question from consultations c
    where private.is_sandbox_guest(c.author_profile_id) and c.status = 'open' and c.created_at < now() - interval '1 minute'
      and not exists (select 1 from consultation_responses x where x.consultation_id = c.id)
  loop
    responder := null;
    select p.id into responder from profiles p, consultations cc
    where cc.id = r.id and p.is_demo and not private.is_sandbox_guest(p.id) and p.id <> r.owner
      and case
        when cc.group_id is not null then exists (select 1 from consultation_group_members gm where gm.group_id = cc.group_id and gm.profile_id = p.id and gm.status = 'joined')
        when cc.audience_type = 'selected' then p.id = any(coalesce(cc.audience_profile_ids, '{}'::uuid[]))
        when cc.audience_type = 'trusted' then exists (select 1 from trusted_colleagues t where t.profile_id = r.owner and t.colleague_id = p.id)
        else p.consultation_availability = 'yes'
      end
    order by (p.consultation_availability = 'yes') desc, random() limit 1;
    continue when responder is null;
    insert into consultation_responses (consultation_id, responder_profile_id, response_type, body)
    values (r.id, responder, 'reply', (case
      when r.question ~* '(leave|cover|hand-?off|away|vacation|sabbatical|parental|maternity|paternity)' then 'For leave, I''d agree the handoff in writing first: who covers which clients, how urgent contacts reach them, and when the coverage summary goes over. The Extended Leave Pack in the Practice Library has a good checklist for it.'
      when r.question ~* '(refer|wait ?list)' then 'I''d send two or three names that fit the client''s needs, insurance and location, and offer a short call with the colleague first. It makes the transfer feel like continuity rather than a goodbye.'
      when r.question ~* '(supervis|licensure|trainee)' then 'Happy to talk it through. I''d agree the frequency, how cases are presented and how notes are kept before the first session.'
      when r.question ~* '(consent|telehealth|state|license|board)' then 'Check your state board''s current guidance first, then put it in your consent form in plain language. That covers most of the risk.'
      when r.question ~* '(record|subpoena|documentation|notes)' then 'Document the reasoning, not just the decision, and keep a copy of anything you release. For a subpoena, call your liability carrier before you respond.'
      when r.question ~* '(fee|billing|insurance|superbill|payment)' then 'Put it in your financial policy and go over it at intake. Clients rarely object to a rule they heard about up front.'
      else 'I''d start by naming what hasn''t worked and agreeing one small, concrete goal for the next three sessions. The Case Consultation Template is a good way to frame it if you want more input.'
    end));
    update consultations set status = 'responses_received' where id = r.id;
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('consultation_response', responder, 'member_web', 'replied to your consultation', '/dashboard/consult/' || r.id, '{"demo":true}')
    returning id into ev;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev, r.owner, 'in_app', 'sent', now());
    acted := acted + 1;
  end loop;

  update connections set status = 'accepted', responded_at = now()
  where status = 'pending' and created_at < now() - interval '1 minute'
    and private.is_sandbox_guest(requester_id) and not private.is_sandbox_guest(addressee_id);

  for r in
    select distinct on (m.conversation_id) m.conversation_id, m.author_id as owner
    from conversation_messages m
    where private.is_sandbox_guest(m.author_id) and m.created_at < now() - interval '1 minute'
      and not exists (select 1 from conversation_messages y where y.conversation_id = m.conversation_id and y.created_at > m.created_at)
    order by m.conversation_id, m.created_at desc
  loop
    select cp.profile_id into responder from conversation_participants cp
    where cp.conversation_id = r.conversation_id and cp.profile_id <> r.owner limit 1;
    continue when responder is null;
    insert into conversation_messages (conversation_id, author_id, body)
    values (r.conversation_id, responder, 'Thanks, that works for me. I''ll send a couple of times for a quick call.');
    update conversations set last_message_at = now() where id = r.conversation_id;
    insert into message_reactions (message_id, profile_id, conversation_id, reaction)
    select m.id, responder, r.conversation_id, 'like' from conversation_messages m
    where m.conversation_id = r.conversation_id and m.author_id = r.owner order by m.created_at desc limit 1
    on conflict do nothing;
    acted := acted + 1;
  end loop;

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

revoke all on function private.demo_autorespond() from public, anon, authenticated;

-- ------------------------------------------------------------------ check
-- Expect: one row, every column true.
select
  exists (select 1 from pg_trigger where tgname = 'guard_cover_acceptance') as cover_guard,
  exists (select 1 from pg_trigger where tgname = 'settle_cover_siblings') as cover_settle,
  exists (select 1 from pg_trigger where tgname = 'guard_referral_single_choice') as referral_guard,
  to_regprocedure('public.respond_to_cover_request(bigint,text)') is not null as cover_rpc,
  to_regprocedure('public.choose_referral_colleague(bigint,uuid)') is not null as referral_rpc,
  to_regprocedure('public.raise_notification(text,text,text,text,jsonb,text,jsonb)') is not null as notify_rpc,
  to_regprocedure('public.set_response_useful(bigint,boolean)') is not null as useful_rpc,
  pg_get_constraintdef((select oid from pg_constraint where conname = 'valid_digest_frequency')) like '%fortnightly%' as fortnightly_ok,
  position('storage.objects' in pg_get_functiondef('public.delete_my_account'::regproc)) > 0 as erasure_guard;
