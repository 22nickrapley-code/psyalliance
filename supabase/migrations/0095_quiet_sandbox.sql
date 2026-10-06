-- A quieter sandbox (6 Oct 2026). A guest starts with a complete practice
-- and circle but nothing waiting. Colleagues then get in touch one at a
-- time while the guest looks around: a message, a cover request, a
-- referral, a circle invitation, a consultation group. The app calls
-- public.sandbox_tick() every half minute and shows each arrival.
-- Applied to both projects; sandboxes exist only on the demo.

create table if not exists private.sandbox_story (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  step int not null default 0,
  next_at timestamptz not null default now()
);

create or replace function private.seed_demo_viewer_story(p_viewer uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  insert into private.sandbox_story (profile_id, step, next_at) values (p_viewer, 0, now() + interval '75 seconds')
  on conflict (profile_id) do update set step = 0, next_at = now() + interval '75 seconds';
end;
$function$;
revoke all on function private.seed_demo_viewer_story(uuid) from public, anon, authenticated;

create or replace function private.sandbox_story_event(p_viewer uuid, p_step int)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  maya uuid; eli uuid; imani uuid; samuel uuid; lena uuid; noah uuid; ny uuid[]; nj uuid[];
  new_id bigint; plan_id bigint; case_id bigint; ev_id bigint; conv_id bigint; grp_id bigint;
  who text;
begin
  select id into maya from profiles where is_demo and full_name = 'Maya Chen' and primary_state = 'NY';
  select id into eli from profiles where is_demo and full_name = 'Eli Ramirez' and primary_state = 'NY';
  select id into imani from profiles where is_demo and full_name = 'Imani Brooks' and primary_state = 'NY';
  select id into samuel from profiles where is_demo and full_name = 'Samuel Okafor' and primary_state = 'NY';
  select id into lena from profiles where is_demo and full_name = 'Lena Park' and primary_state = 'NY';
  select id into noah from profiles where is_demo and full_name = 'Noah Patel' and primary_state = 'NJ';
  -- Same ordering as seed_demo_viewer, so ny[1] is the same colleague.
  select array_agg(p.id order by u.email) into ny from profiles p join auth.users u on u.id = p.id
    where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'NY' and p.id not in (maya, eli, imani, samuel, lena);
  select array_agg(p.id order by u.email) into nj from profiles p join auth.users u on u.id = p.id
    where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'NJ' and p.id <> noah;

  if p_step = 1 then
    -- A friendly message from a trusted colleague.
    insert into conversations (created_by, title, created_at, last_message_at) values (maya, null, now(), now()) returning id into conv_id;
    insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, maya, now()), (conv_id, p_viewer, now() - interval '1 day');
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, maya, 'Congratulations again on your news! When you plan your leave, I have two cover slots free. Send the plan my way.', now());
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('message_received', maya, 'member_web', 'sent you a message', '/dashboard/messages/' || conv_id, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    return jsonb_build_object('kind', 'message', 'title', 'Maya Chen sent you a message',
      'body', 'She has cover slots free for your leave.', 'href', '/dashboard/messages/' || conv_id, 'action', 'Read it');

  elsif p_step = 2 then
    -- An urgent cover request from a trusted colleague.
    select full_name into who from profiles where id = ny[1];
    insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
    values (ny[1], 'Unexpected absence, this week', 'unexpected', 'NY', 'parallel', 'active', current_date, current_date + 10, 'ad_hoc', now())
    returning id into plan_id;
    insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan_id, p_viewer);
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status)
    values (plan_id, 'Client 1', array[7], 'Adults', 'virtual', 'Self-pay (out of network)', 'Weekly', 'awaiting_response') returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, message, sent_at)
    values (case_id, p_viewer, 1, 'sent', 'Family emergency, back in ten days. Could you hold two sessions? Summary to follow once you agree.', now());
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status)
    values (plan_id, 'Client 2', array[61], 'Adults', 'either', 'Aetna', 'Weekly', 'awaiting_response') returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, message, sent_at)
    values (case_id, p_viewer, 1, 'sent', 'Family emergency, back in ten days. Could you hold two sessions? Summary to follow once you agree.', now());
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_request', ny[1], 'member_web', 'sent you a coverage request', '/dashboard/cover', '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    return jsonb_build_object('kind', 'cover', 'title', split_part(who, ' ', 1) || ' needs cover for two clients',
      'body', 'An unexpected absence this week. Accept, discuss or decline each client.', 'href', '/dashboard/cover', 'action', 'Review the request');

  elsif p_step = 3 then
    -- A referral sent to Alex.
    insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
      notes, status, audience_type, audience_profile_ids, created_at)
    values (eli, array[7, 35], 7, 'NY', 'Manhattan', 'Self-pay (out of network)', 'Young Adults', 'in_person', 'urgent',
      'Needs someone soon; current clinician is relocating out of state.', 'sent', 'selected', array[p_viewer], now())
    returning id into new_id;
    insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('referral_sent', eli, 'member_web', 'sent you a referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    return jsonb_build_object('kind', 'referral', 'title', 'Eli Ramirez sent you a referral',
      'body', 'A young adult with trauma, in Manhattan, who needs someone soon.', 'href', '/dashboard/refer/' || new_id, 'action', 'Reply');

  elsif p_step = 4 then
    -- An invitation to a colleague's trusted circle.
    insert into connections (requester_id, addressee_id, tier, status, created_at) values (imani, p_viewer, 'trusted_colleague', 'pending', now())
    on conflict do nothing;
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('trusted_invitation_sent', imani, 'member_web', 'invited you to their trusted circle', '/dashboard/people/' || imani, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    return jsonb_build_object('kind', 'circle', 'title', 'Imani Brooks invited you to her trusted circle',
      'body', 'Trusted colleagues come first in each other''s matches.', 'href', '/dashboard/people/' || imani, 'action', 'See her profile');

  elsif p_step = 5 then
    -- An invitation to a consultation group.
    insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
    values ('Hudson Child & Adolescent Peer Group', 'Fortnightly peer consultation on child and adolescent clients across New York and New Jersey', nj[3], 'Every two weeks', 'hybrid',
      'Members only. Client details de-identified. Consultation, not supervision. Parents and schools are discussed only in general terms.', 1)
    returning id into grp_id;
    insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', grp_id, p_viewer);
    insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
    values (grp_id, nj[3], 'joined', 'creator', now()), (grp_id, nj[2], 'joined', 'member', now()), (grp_id, ny[2], 'joined', 'member', now());
    insert into consultation_group_members (group_id, profile_id, status, role) values (grp_id, p_viewer, 'invited', 'member');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('consultation_invite', nj[3], 'member_web', 'invited you to join the Hudson Child & Adolescent Peer Group', '/dashboard/consult/groups/' || grp_id, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
    return jsonb_build_object('kind', 'group', 'title', 'You''re invited to a consultation group',
      'body', 'The Hudson Child & Adolescent Peer Group meets every two weeks.', 'href', '/dashboard/consult/groups/' || grp_id, 'action', 'Have a look');
  end if;
  return null;
end;
$function$;
revoke all on function private.sandbox_story_event(uuid, int) from public, anon, authenticated;

create or replace function public.sandbox_tick()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  st record;
  result jsonb;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    return null;
  end if;
  select * into st from private.sandbox_story where profile_id = me for update skip locked;
  if st.profile_id is null or st.step >= 5 or now() < st.next_at then
    return null;
  end if;
  result := private.sandbox_story_event(me, st.step + 1);
  update private.sandbox_story
     set step = st.step + 1,
         next_at = now() + (array[interval '120 seconds', interval '150 seconds', interval '180 seconds', interval '180 seconds', interval '0 seconds'])[st.step + 1]
   where profile_id = me;
  return result;
end;
$function$;
revoke execute on function public.sandbox_tick() from public, anon;
grant execute on function public.sandbox_tick() to authenticated;

-- The guest's starting state: keep the practice, circle (accepted and
-- saved), history, a closed past referral and the Thursday Circle group;
-- drop everything that was waiting (invitations, referrals, cover
-- requests, Alex's own plan, referral and question, conversations). The
-- NJ licence starts awaiting review. Edited in place so the two projects'
-- copies (one with comments, one without) stay identical in substance.
do $$
declare
  d text := pg_get_functiondef('private.seed_demo_viewer'::regproc);
  a_end int; b_end int; p1 int; p2 int; c1 int; c2 int; d1 int; d2 int;
  partA text; partB text; partC text; partD text; nd text;
begin
  a_end := strpos(d, E'  insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)');
  b_end := strpos(d, E'  for a in select x from unnest(array[imani, nj[3]]) x loop');
  p1 := strpos(d, E'  insert into connections (requester_id, addressee_id, tier, status, created_at)\n  select x, p_viewer, ''trusted_colleague'', ''pending''');
  p2 := strpos(d, E'  insert into saved_clinicians');
  c1 := strpos(d, E'  insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, age_band, modality, timeframe, status, audience_type, audience_profile_ids, created_at, closed_at)');
  c2 := c1 + strpos(substr(d, c1), E'  insert into coverage_plans') - 1;
  d1 := strpos(d, E'  insert into consultation_groups');
  d2 := d1 + 10 + strpos(substr(d, d1 + 10), E'  insert into consultation_groups') - 1;
  if a_end = 0 or b_end = 0 or p1 = 0 or p2 = 0 or c1 = 0 or c2 < c1 or d1 = 0 or d2 <= d1 + 10 then
    raise exception 'marker missing a=% b=% p1=% p2=% c1=% c2=% d1=% d2=%', a_end, b_end, p1, p2, c1, c2, d1, d2;
  end if;
  partA := substr(d, 1, a_end - 1);
  partA := replace(partA, E'current_date + 610, now(), ''Fictional demo licence'')', E'current_date + 610, null, ''Fictional demo licence: awaiting review'')');
  partA := replace(partA, 'by telehealth across New York and New Jersey.', 'by telehealth across New York.');
  partB := substr(d, a_end, p1 - a_end) || substr(d, p2, b_end - p2);
  partC := substr(d, c1, c2 - c1);
  partD := substr(d, d1, d2 - d1);
  if strpos(partD, 'Thursday Circle') = 0 or strpos(partD, 'Hudson') > 0 then raise exception 'group section wrong'; end if;
  if strpos(partA, 'awaiting review') = 0 then raise exception 'licence replace failed'; end if;
  nd := partA || partB || partC || partD
     || E'  insert into consult_tag_follows (profile_id, tag) values (p_viewer, ''Trauma/PTSD''), (p_viewer, ''Private practice'') on conflict do nothing;\n'
     || E'  -- The story starts quiet: colleagues get in touch one at a time (public.sandbox_tick).\n'
     || E'  perform private.seed_demo_viewer_story(p_viewer);\nend;\n$function$\n';
  execute nd;
end $$;
