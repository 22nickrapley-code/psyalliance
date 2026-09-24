-- Demo environment: sandbox access for prospects.
--
-- This migration is safe everywhere, but everything in it only acts when
-- app_config.app_env = 'demo', which is set only in the separate demo
-- Supabase project. On the real site, claim_sandbox refuses and the
-- scheduled jobs do nothing.
--
-- How it works:
--   * An admin on the demo site issues a personal sandbox pass for a named
--     prospect. It expires (7 days by default) and can be revoked.
--   * Opening the pass creates a fresh, fictional guest account with its
--     own sample activity (a cover plan part-way through, referrals, a
--     consult, groups and messages) among the 120 fictional members. The
--     guest is signed in with a random one-off password nobody sees.
--     There is no shared password.
--   * Each claim, and "Reset my sandbox", wipes the guest's state and
--     re-creates it, so every session starts from the same story.
--   * Fictional colleagues answer the guest's cover requests, referrals,
--     consult questions, invitations and messages within a minute or two.
--   * Guests are demo accounts: no email is ever sent to or from them,
--     they can't invite anyone by email, and they have no admin access.
--   * Expired guests are deleted every hour.

alter table private.demo_rows add column if not exists owner uuid;

-- ---------------------------------------------------------------- viewer story
create or replace function private.seed_demo_viewer(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a uuid; n int;
  new_id bigint; plan_id bigint; case_id bigint; ev_id bigint; conv_id bigint; grp_id bigint; cons_id bigint;
  trusted uuid[]; tx_ids uuid[]; ma_ids uuid[]; ny_ids uuid[];
begin
  select array_agg(p.id order by substring(u.email from '-(\d+)@seed')::int) into ny_ids
    from profiles p join auth.users u on u.id = p.id where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'NY';
  select array_agg(p.id order by substring(u.email from '-(\d+)@seed')::int) into ma_ids
    from profiles p join auth.users u on u.id = p.id where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'MA';
  select array_agg(p.id order by substring(u.email from '-(\d+)@seed')::int) into tx_ids
    from profiles p join auth.users u on u.id = p.id where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'TX';
  if coalesce(array_length(tx_ids, 1), 0) < 22 or coalesce(array_length(ma_ids, 1), 0) < 20 or coalesce(array_length(ny_ids, 1), 0) < 21 then
    raise exception 'Seed the demo members first: select private.seed_demo_network(null);';
  end if;

    -- trusted circle, invitations, saved
    trusted := array[tx_ids[1], tx_ids[4], tx_ids[7], ma_ids[2], ma_ids[5], ny_ids[3], ny_ids[8]];
    insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)
    select x, p_viewer, 'trusted_colleague', 'accepted', now() - ((20 + random() * 200) || ' days')::interval, now() - ((10 + random() * 100) || ' days')::interval
    from unnest(trusted) x;
    insert into connections (requester_id, addressee_id, tier, status, created_at)
    select x, p_viewer, 'trusted_colleague', 'pending', now() - ((1 + random() * 5) || ' days')::interval
    from unnest(array[tx_ids[10], ma_ids[11], ny_ids[12]]) x;
    insert into connections (requester_id, addressee_id, tier, status, created_at)
    values (p_viewer, tx_ids[13], 'trusted_colleague', 'pending', now() - interval '2 days');
    insert into saved_clinicians (profile_id, clinician_id, note)
    select p_viewer, x, null from unnest(array[tx_ids[15], tx_ids[18], ma_ids[20], ny_ids[21], tx_ids[22]]) x
    on conflict do nothing;

    -- worked with before
    insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, created_at)
    values ('coverage_completed', tx_ids[1], 'member_web', p_viewer, 'Demo activity', now() - interval '60 days'),
           ('referral_outcome', tx_ids[4], 'member_web', p_viewer, 'Demo activity', now() - interval '35 days'),
           ('consultation_response', ma_ids[2], 'member_web', p_viewer, 'Demo activity', now() - interval '20 days'),
           ('referral_outcome', tx_ids[1], 'member_web', p_viewer, 'Demo activity', now() - interval '120 days');

    -- invitations as notifications
    for a in select x from unnest(array[tx_ids[10], ma_ids[11], ny_ids[12]]) x loop
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('trusted_invitation_sent', a, 'member_web', 'invited you to their trusted circle', '/dashboard/network', '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    end loop;

    -- referrals offered to the viewer
    for n in 1..3 loop
      a := (array[tx_ids[2], tx_ids[1], tx_ids[9]])[n];
      insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
        notes, status, audience_type, audience_profile_ids, created_at)
      values (a, (array[array[7, 57], array[61, 0], array[16, 35]])[n:n], (array[7, 61, 16])[n], 'TX', 'Austin',
        (array['Aetna', 'Self-pay (out of network)', 'UnitedHealthcare / Optum'])[n], (array['Adults', 'Young Adults', 'Adults'])[n],
        (array['either', 'virtual', 'in_person'])[n], (array['within_month', 'urgent', 'flexible'])[n],
        (array['Weekday evenings preferred. Happy to talk through fit first.', 'Needs someone soon; current clinician is relocating.', 'Prefers in-person, flexible on timing.'])[n],
        'sent', case when n = 2 then 'trusted' else 'selected' end, array[p_viewer], now() - ((n * 1.5) || ' days')::interval)
      returning id into new_id;
      update referral_requests set specialism_lookup_ids = array(select x from unnest(specialism_lookup_ids) x where x <> 0) where id = new_id;
      insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('referral_sent', a, 'member_web', 'sent you a referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    end loop;

    -- the viewer's own referral, with replies
    insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
      notes, status, audience_type, audience_profile_ids, created_at)
    values (p_viewer, array[41], 41, 'TX', 'Austin', 'Cigna', 'Adolescents', 'either', 'within_month',
      'Adolescent, needs ERP experience. Parent involvement expected.', 'sent', 'selected', array[tx_ids[3], tx_ids[6], tx_ids[11]], now() - interval '3 days')
    returning id into new_id;
    insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
    insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
    values (new_id, tx_ids[3], 'interested', 'I have two openings for adolescents and do ERP weekly. Happy to take this.', now() - interval '2 days', now() - interval '2 days'),
           (new_id, tx_ids[6], 'interested', 'Could start in three weeks. In person in Round Rock or virtual.', now() - interval '1 day', now() - interval '1 day'),
           (new_id, tx_ids[11], 'unavailable', 'Full until January, sorry.', now() - interval '1 day', now() - interval '1 day');
    for a in select x from unnest(array[tx_ids[3], tx_ids[6]]) x loop
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('referral_response', a, 'member_web', 'responded "interested" to your referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    end loop;
    -- and an earlier one, closed
    insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, age_band, modality, timeframe, status, audience_type, audience_profile_ids, created_at, closed_at)
    values (p_viewer, array[27], 27, 'TX', 'Austin', 'Seniors', 'in_person', 'flexible', 'closed', 'selected', array[tx_ids[4]], now() - interval '40 days', now() - interval '33 days')
    returning id into new_id;
    insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
    insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
    values (new_id, tx_ids[4], 'accepted', 'Yes, I can see them from next week.', now() - interval '39 days', now() - interval '39 days');

    -- a colleague asking the viewer for urgent cover
    insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
    values (tx_ids[7], 'Unexpected absence, this week', 'unexpected', 'TX', 'parallel', 'active', current_date, current_date + 10, 'ad_hoc', now() - interval '6 hours')
    returning id into plan_id;
    insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan_id, p_viewer);
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status)
    values (plan_id, 'Case 1', array[7], 'Adults', 'virtual', 'Self-pay (out of network)', 'Weekly', 'awaiting_response') returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, message, sent_at)
    values (case_id, p_viewer, 1, 'sent', 'Could you hold two sessions while I''m out? Summary to follow once you agree.', now() - interval '6 hours');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_request', tx_ids[7], 'member_web', 'sent you a coverage request', '/dashboard/cover', '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());

    -- the viewer's own cover plan, part-way through
    insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
    values (p_viewer, 'Parental leave, November', 'extended_leave', 'TX', 'sequential', 'active', current_date + 40, current_date + 130, 'extended_leave', now() - interval '5 days')
    returning id into plan_id;
    insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan_id, p_viewer);
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status, assigned_clinician_id)
    values (plan_id, 'Case 1', array[7, 57], 'Adults', 'either', 'Aetna', 'Weekly', 'confirmed', tx_ids[1]) returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, sent_at, responded_at)
    values (case_id, tx_ids[1], 1, 'accepted', now() - interval '4 days', now() - interval '3 days');
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status, outreach_queue)
    values (plan_id, 'Case 2', array[61], 'Young Adults', 'virtual', 'Self-pay (out of network)', 'Weekly', 'awaiting_response', array[tx_ids[16]]) returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, sent_at)
    values (case_id, tx_ids[4], 1, 'sent', now() - interval '1 day');
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, prescribing_needed, status)
    values (plan_id, 'Case 3', array[10], 'Adults', 'in_person', 'UnitedHealthcare / Optum', 'Fortnightly', true, 'needs_cover');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_confirmed', tx_ids[1], 'member_web', 'confirmed they can cover your case', '/dashboard/cover/' || plan_id || '?step=track', '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());

    -- the viewer's question, answered
    insert into consultations (author_profile_id, question, context, consultation_type, audience_type, tags, status, deidentification_confirmed, kind, created_at)
    values (p_viewer, 'How are you structuring the handover call when a covering colleague takes over mid-treatment?',
      'Planning an extended leave and want the transition to feel seamless for clients.', 'termination_transfer', 'trusted', array['Private practice'], 'responses_received', true, 'question', now() - interval '2 days')
    returning id into cons_id;
    insert into private.demo_rows (tbl, id, owner) values ('consultations', cons_id, p_viewer);
    insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, created_at)
    values (cons_id, tx_ids[1], 'reply', 'I do a 20-minute joint call with the colleague before leave starts, then a written summary. PA-02 has a good checklist.', now() - interval '1 day'),
           (cons_id, ma_ids[2], 'reply', 'Tell clients who to contact and when, in writing. The ambiguity is what unsettles people.', now() - interval '20 hours');
    for a in select x from unnest(array[tx_ids[1], ma_ids[2]]) x loop
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('consultation_response', a, 'member_web', 'replied to your consultation', '/dashboard/consult/' || cons_id, '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    end loop;
    insert into consult_tag_follows (profile_id, tag) values (p_viewer, 'Trauma/PTSD'), (p_viewer, 'Private practice') on conflict do nothing;

    -- consultation groups: one joined, one invitation
    insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
    values ('Austin Trauma Consultation Group', 'Monthly case consultation for clinicians working with trauma', tx_ids[1], 'Monthly', 'video',
      'Members only. Cases are always de-identified. This is consultation, not supervision: the treating clinician decides. No recording or transcription. Present cases using the PA-05 format.', 2)
    returning id into grp_id;
    insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', grp_id, p_viewer);
    insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
    values (grp_id, tx_ids[1], 'joined', 'creator', now()), (grp_id, p_viewer, 'joined', 'member', now()),
           (grp_id, tx_ids[4], 'joined', 'member', now()), (grp_id, tx_ids[7], 'joined', 'member', now()), (grp_id, tx_ids[19], 'joined', 'member', now());
    insert into consultations (author_profile_id, question, context, consultation_type, audience_type, group_id, status, deidentification_confirmed, kind, created_at)
    values (tx_ids[4], 'Adult client with complex trauma dissociating in session: pacing EMDR preparation', 'Broad context only; happy to discuss at the next meeting.', 'treatment_impasse', 'selected', grp_id, 'responses_received', true, 'question', now() - interval '4 days')
    returning id into cons_id;
    insert into consultation_responses (consultation_id, responder_profile_id, body, created_at)
    values (cons_id, tx_ids[1], 'I''d extend resourcing and check window of tolerance each session before any processing.', now() - interval '3 days'),
           (cons_id, tx_ids[19], 'Grounding objects helped one of mine. Agree on slowing down.', now() - interval '2 days');
    insert into consultations (author_profile_id, question, audience_type, group_id, status, deidentification_confirmed, kind, created_at)
    values (tx_ids[7], 'Agenda for next month: vicarious trauma and caseload limits', 'selected', grp_id, 'open', true, 'question', now() - interval '1 day');

    insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
    values ('Boston Child & Adolescent Peer Group', 'Fortnightly peer consultation on child and adolescent cases', ma_ids[5], 'Every two weeks', 'hybrid',
      'Members only. De-identified cases. Consultation, not supervision. Parents and schools are discussed only in general terms.', 1)
    returning id into grp_id;
    insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', grp_id, p_viewer);
    insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
    values (grp_id, ma_ids[5], 'joined', 'creator', now()), (grp_id, ma_ids[2], 'joined', 'member', now()), (grp_id, ny_ids[3], 'joined', 'member', now());
    insert into consultation_group_members (group_id, profile_id, status, role) values (grp_id, p_viewer, 'invited', 'member');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('consultation_invite', ma_ids[5], 'member_web', 'invited you to join the Boston Child & Adolescent Peer Group', '/dashboard/consult/groups/' || grp_id, '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());

    -- messages
    insert into conversations (created_by, title, created_at, last_message_at)
    values (tx_ids[3], 'Referral · Obsessive/Compulsive Disorder · Austin, TX', now() - interval '2 days', now() - interval '3 hours') returning id into conv_id;
    insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, tx_ids[3], now()), (conv_id, p_viewer, now() - interval '1 day');
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, tx_ids[3], 'Thanks for thinking of me for this one. I have Tuesday and Thursday afternoons free.', now() - interval '2 days'),
           (conv_id, tx_ids[3], 'Also happy to do a quick call with the family first if that helps.', now() - interval '3 hours');
    insert into conversations (created_by, title, created_at, last_message_at)
    values (tx_ids[1], 'Cover · Parental leave, November', now() - interval '3 days', now() - interval '1 day') returning id into conv_id;
    insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, tx_ids[1], now()), (conv_id, p_viewer, now() - interval '2 days');
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, tx_ids[1], 'Happy to take Case 1. Can we do the handover call the week before you go?', now() - interval '3 days'),
           (conv_id, p_viewer, 'Perfect, thank you. I''ll send times.', now() - interval '2 days'),
           (conv_id, tx_ids[1], 'Great. I''ve blocked Thursday mornings for them from mid-November.', now() - interval '1 day');
    insert into conversations (created_by, title, created_at, last_message_at)
    values (ma_ids[2], 'Coffee at the APA meeting?', now() - interval '8 days', now() - interval '7 days') returning id into conv_id;
    insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, ma_ids[2], now()), (conv_id, p_viewer, now());
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, ma_ids[2], 'Are you going to the regional meeting next month? Would be good to meet in person.', now() - interval '8 days'),
           (conv_id, p_viewer, 'Yes, I''ll be there Friday. Let''s find a slot.', now() - interval '7 days');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('message_received', tx_ids[3], 'member_web', 'sent you a message', '/dashboard/messages', '{"demo":true}') returning id into ev_id;
      insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
end;
$$;
revoke all on function private.seed_demo_viewer(uuid) from public, anon, authenticated;

create or replace function private.clear_demo_viewer(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from consultations where group_id in (select id from private.demo_rows where tbl = 'consultation_groups' and owner = p_viewer);
  delete from consultation_groups where id in (select id from private.demo_rows where tbl = 'consultation_groups' and owner = p_viewer);
  delete from conversations where id in (select id from private.demo_rows where tbl = 'conversations' and owner = p_viewer);
  delete from referral_requests where id in (select id from private.demo_rows where tbl = 'referral_requests' and owner = p_viewer);
  delete from coverage_plans where id in (select id from private.demo_rows where tbl = 'coverage_plans' and owner = p_viewer);
  delete from consultations where id in (select id from private.demo_rows where tbl = 'consultations' and owner = p_viewer);
  delete from notification_events where id in (select id from private.demo_rows where tbl = 'notification_events' and owner = p_viewer);
  delete from private.demo_rows where owner = p_viewer;
  -- and anything the guest made themselves
  delete from referral_requests where requesting_profile_id = p_viewer;
  delete from coverage_plans where profile_id = p_viewer;
  delete from consultations where author_profile_id = p_viewer;
  delete from consultation_groups where created_by = p_viewer;
  delete from conversations where id in (select conversation_id from conversation_participants where profile_id = p_viewer);
  delete from notification_events where actor_profile_id = p_viewer;
  delete from notification_deliveries where recipient_profile_id = p_viewer;
  delete from connections where p_viewer in (requester_id, addressee_id);
  delete from saved_clinicians where profile_id = p_viewer;
  delete from consult_tag_follows where profile_id = p_viewer;
  delete from consultation_group_members where profile_id = p_viewer;
  delete from professional_events where p_viewer in (actor_profile_id, related_profile_id, subject_profile_id);
end;
$$;
revoke all on function private.clear_demo_viewer(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ sandbox passes
create table if not exists public.sandbox_passes (
  id bigint generated always as identity primary key,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  label text not null check (length(trim(label)) between 2 and 120),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  claimed_at timestamptz,
  claims int not null default 0,
  guest_id uuid
);
create index if not exists sandbox_passes_created_by_idx on public.sandbox_passes(created_by);
create index if not exists sandbox_passes_guest_idx on public.sandbox_passes(guest_id);
alter table public.sandbox_passes enable row level security;
drop policy if exists "admins manage sandbox passes" on public.sandbox_passes;
create policy "admins manage sandbox passes" on public.sandbox_passes
  for all to authenticated
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));

create or replace function private.is_sandbox_guest(uid uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (select 1 from sandbox_passes where guest_id = uid);
$$;
revoke execute on function private.is_sandbox_guest(uuid) from public, anon;
grant execute on function private.is_sandbox_guest(uuid) to authenticated;

create or replace function private.delete_sandbox_guest(p_guest uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guest is null then return; end if;
  perform private.clear_demo_viewer(p_guest);
  delete from auth.users where id = p_guest and email like '%@sandbox.psyalliance.test';
end;
$$;
revoke all on function private.delete_sandbox_guest(uuid) from public, anon, authenticated;

-- Anyone holding a valid pass can open it. Returns one-off sign-in details
-- for the fresh guest account; the password is random, used once by the
-- server and never shown.
create or replace function public.claim_sandbox(p_token text)
returns table(email text, password text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pass record;
  gid uuid := gen_random_uuid();
  gmail text;
  pw text := encode(gen_random_bytes(24), 'hex');
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    raise exception 'Sandboxes exist only on the demo site.' using errcode = 'P0001';
  end if;
  select * into pass from sandbox_passes s
  where s.token = p_token and s.revoked_at is null and s.expires_at > now()
  for update;
  if pass.id is null then
    raise exception 'This sandbox link has expired. Ask for a new one.' using errcode = 'P0001';
  end if;
  perform private.delete_sandbox_guest(pass.guest_id);

  gmail := 'guest-' || substr(replace(gid::text, '-', ''), 1, 12) || '@sandbox.psyalliance.test';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gid, 'authenticated', 'authenticated', gmail,
    crypt(pw, gen_salt('bf')), now(), '', '', '', '',
    '{"provider":"email","providers":["email"],"created_by_system":"true"}'::jsonb,
    jsonb_build_object('full_name', 'Alex Rivers'), false, false, now(), now());
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), gid, gid::text, 'email', jsonb_build_object('sub', gid::text, 'email', gmail, 'email_verified', true), now(), now(), now());

  insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified,
    verification_status, verified_at, is_demo, account_status, account_kind, directory_visible, bio,
    referral_availability, coverage_availability, consultation_availability, availability_confirmed_at, accepting_referrals)
  values (gid, 'Alex Rivers', 'Dr.', 'PsyD', 'TX', 'Austin', array['TX'],
    'verified', now(), true, 'active', 'clinician', true,
    'Fictional sandbox profile. Adults and adolescents; anxiety, OCD and trauma. Austin and telehealth across Texas.',
    'limited', 'ask_me', 'yes', now() - interval '3 days', true)
  on conflict (id) do nothing;
  insert into licenses (profile_id, state, license_number, license_type, status, expiration_date, reviewed_at, notes)
  values (gid, 'TX', 'DEMO-TX-0000', 'Psychologist', 'active', current_date + 400, now(), 'Fictional demo licence');

  perform private.seed_demo_viewer(gid);
  update sandbox_passes set guest_id = gid, claimed_at = now(), claims = claims + 1 where id = pass.id;
  return query select gmail, pw, pass.expires_at;
end;
$$;
revoke execute on function public.claim_sandbox(text) from public;
grant execute on function public.claim_sandbox(text) to anon, authenticated;

-- A signed-in guest starts the story again.
create or replace function public.reset_my_sandbox()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or not private.is_sandbox_guest(auth.uid()) then
    raise exception 'Only sandbox guests can reset.' using errcode = 'P0001';
  end if;
  perform private.clear_demo_viewer(auth.uid());
  perform private.seed_demo_viewer(auth.uid());
end;
$$;
revoke execute on function public.reset_my_sandbox() from public, anon;
grant execute on function public.reset_my_sandbox() to authenticated;

create or replace function public.my_sandbox()
returns table(label text, expires_at timestamptz)
language sql
stable security definer
set search_path = public
as $$
  select s.label, s.expires_at from sandbox_passes s where s.guest_id = auth.uid();
$$;
revoke execute on function public.my_sandbox() from public, anon;
grant execute on function public.my_sandbox() to authenticated;

-- Demo accounts never invite anyone by email.
create or replace function public.guard_demo_external_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.external_email is not null and auth.uid() is not null and public.viewer_is_demo() then
    raise exception 'Email invitations are switched off in the demo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_demo_external_invite() from public, anon, authenticated;
drop trigger if exists guard_demo_external_invite on public.consultation_group_members;
create trigger guard_demo_external_invite before insert on public.consultation_group_members
  for each row execute function public.guard_demo_external_invite();

-- ---------------------------------------------- fictional colleagues respond
create or replace function private.demo_autorespond()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; acted int := 0; ev bigint; responder uuid; conv bigint;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return 0;
  end if;

  -- cover requests from guests: most accept, some decline
  for r in
    select cr.id, cr.requested_profile_id, pl.profile_id as owner, pl.id as plan_id, pl.title
    from coverage_requests cr
    join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
    join coverage_plans pl on pl.id = c.coverage_plan_id
    where cr.status = 'sent' and cr.sent_at < now() - interval '1 minute'
      and private.is_sandbox_guest(pl.profile_id) and not private.is_sandbox_guest(cr.requested_profile_id)
  loop
    update coverage_requests set status = (case when random() < 0.75 then 'accepted' else 'declined' end)::coverage_request_status, responded_at = now()
    where id = r.id;
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_response', r.requested_profile_id, 'member_web', 'replied to your cover request', '/dashboard/cover/' || r.plan_id || '?step=track', '{"demo":true}')
    returning id into ev;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev, r.owner, 'in_app', 'sent', now());
    acted := acted + 1;
  end loop;

  -- referrals from guests: up to two colleagues licensed in the state reply
  for r in
    select rr.id, rr.requesting_profile_id as owner, rr.state
    from referral_requests rr
    where private.is_sandbox_guest(rr.requesting_profile_id) and rr.status in ('open', 'sent')
      and rr.created_at < now() - interval '1 minute'
      and not exists (select 1 from referral_responses x where x.referral_request_id = rr.id)
  loop
    for responder in
      select p.id from profiles p
      where p.is_demo and not private.is_sandbox_guest(p.id) and (r.state is null or p.primary_state = r.state)
        and p.referral_availability in ('yes', 'limited')
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

  -- consult questions from guests get a considered reply
  for r in
    select c.id, c.author_profile_id as owner from consultations c
    where private.is_sandbox_guest(c.author_profile_id) and c.status = 'open' and c.created_at < now() - interval '1 minute'
      and not exists (select 1 from consultation_responses x where x.consultation_id = c.id)
  loop
    select p.id into responder from profiles p where p.is_demo and not private.is_sandbox_guest(p.id) and p.consultation_availability = 'yes' order by random() limit 1;
    insert into consultation_responses (consultation_id, responder_profile_id, response_type, body)
    values (r.id, responder, 'reply', 'I''d start by naming what hasn''t worked and agreeing one small, concrete goal for the next three sessions. PA-05 is a good way to frame it if you want more input.');
    update consultations set status = 'responses_received' where id = r.id;
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('consultation_response', responder, 'member_web', 'replied to your consultation', '/dashboard/consult/' || r.id, '{"demo":true}')
    returning id into ev;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev, r.owner, 'in_app', 'sent', now());
    acted := acted + 1;
  end loop;

  -- trusted-circle invitations from guests are accepted
  update connections set status = 'accepted', responded_at = now()
  where status = 'pending' and created_at < now() - interval '1 minute'
    and private.is_sandbox_guest(requester_id) and not private.is_sandbox_guest(addressee_id);

  -- messages from guests get one friendly reply per conversation
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
    acted := acted + 1;
  end loop;

  return acted;
end;
$$;
revoke all on function private.demo_autorespond() from public, anon, authenticated;

create or replace function private.sandbox_cleanup()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare r record; n int := 0;
begin
  for r in select id, guest_id from sandbox_passes where guest_id is not null and (expires_at < now() or revoked_at is not null) loop
    perform private.delete_sandbox_guest(r.guest_id);
    update sandbox_passes set guest_id = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function private.sandbox_cleanup() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('pa_demo_autorespond', 'pa_sandbox_cleanup');
  perform cron.schedule('pa_demo_autorespond', '* * * * *', 'select private.demo_autorespond()');
  perform cron.schedule('pa_sandbox_cleanup', '7 * * * *', 'select private.sandbox_cleanup()');
end $$;
