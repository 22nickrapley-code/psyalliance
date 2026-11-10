-- v9 (Nick, 10 Nov): the sandbox's arrivals show the product at its best: real dilemmas colleagues would want to
-- answer, and requests worth saying yes to. Same steps, same people, same timings as v6; only the words change.
-- Safe to run more than once. Rollback: run the sandbox_story_event definition from 0132_v6.sql again.
CREATE OR REPLACE FUNCTION private.sandbox_story_event(p_viewer uuid, p_step integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint;
  m jsonb; r jsonb; out jsonb := null;
  imani uuid; eli uuid; lena uuid; marcus uuid; sophie uuid; rena uuid; james uuid; maya uuid;
  key text; ref bigint; plan bigint; cid bigint; conv bigint;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return null;
  end if;
  select s.id into pass_id from sandbox_passes s where s.guest_id = p_viewer;
  if pass_id is not null then
    update sandbox_passes set guest_id = null where id = pass_id;
  end if;
  perform set_config('pa.sandbox_owner', p_viewer::text, true);
  m := private.demo_cast_ids();
  imani := (m ->> 'imani')::uuid; eli := (m ->> 'eli')::uuid; lena := (m ->> 'lena')::uuid; marcus := (m ->> 'marcus')::uuid;
  sophie := (m ->> 'sophie')::uuid; rena := (m ->> 'rena')::uuid; james := (m ->> 'james')::uuid; maya := (m ->> 'maya')::uuid;

  begin
    if p_step = 1 then
      perform private.demo_as(eli);
      r := public.cover_create_plan(jsonb_build_object(
        'requestId', md5('story-3-' || p_viewer)::uuid, 'name', 'Winter holiday cover', 'reason', 'short', 'other', '',
        'start', to_char(current_date + 60, 'YYYY-MM-DD'), 'end', to_char(current_date + 70, 'YYYY-MM-DD'),
        'mode', 'sequential', 'deadline', 48, 'message', 'I am away for ten days over the holidays. One client, anxiety, seen weekly by video; she does well with continuity. Could you hold a session or two if she needs one? Happy to talk it through first.',
        'clients', jsonb_build_array(private.demo_client('Client 1', 'Anxiety/Panic Disorders', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
      if jsonb_array_length(r -> 'dropped') = 0 then
        plan := (r ->> 'planId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 1, 'kind', 'cover', 'title', 'Eli Kestrelby asked you about temporary cover',
          'body', 'Ten days of holiday cover for one client, by video. Answer, or ask a question first.', 'view', 'cover', 'id', plan);
      end if;
    elsif p_step = 2 then
      perform private.demo_as(lena);
      r := public.referral_create(jsonb_build_object(
        'requestId', md5('story-4-' || p_viewer)::uuid, 'state', 'VT', 'setting', 'virtual', 'focus', 'Depression', 'secondary', '', 'age', 'Adults',
        'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
        'timeframe', 'Within a month', 'message', 'A thoughtful adult with recurrent depression, ready for weekly CBT by video, mornings if possible. Your work on life transitions makes you a strong fit.', 'prescribing', false));
      if jsonb_array_length(r -> 'dropped') = 0 then
        ref := (r ->> 'referralId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 2, 'kind', 'referral', 'title', 'Lena Larkhollow sent you a referral request',
          'body', 'An adult with depression in Vermont, by video. Say whether you can accept.', 'view', 'referrals', 'id', ref);
      end if;
    elsif p_step = 3 then
      perform private.demo_as(rena);
      r := public.consult_post(jsonb_build_object(
        'clientRequestId', md5('story-v5-6-' || p_viewer)::uuid, 'title', 'A client moving out of state wants to keep working with me. How have you handled the bridge?',
        'body', 'She moves to Oregon next month and I am not licensed there. She is anxious about starting over. A warm handover, a few transition sessions under PSYPACT, or something else? I would value how you have managed it.',
        'topic', 'Clinical practice', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'one', 'recipients', jsonb_build_array(p_viewer)));
      cid := (r ->> 'id')::bigint;
      insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 3, 'kind', 'consult', 'title', 'Rena Mitchell asked you a question',
        'body', 'A client moving out of state: how to bridge the move well.', 'view', 'consult', 'id', cid);
    elsif p_step = 4 then
      perform private.demo_as(sophie);
      r := public.cover_create_plan(jsonb_build_object(
        'requestId', md5('story-v6-4-' || p_viewer)::uuid, 'name', 'Conference week cover', 'reason', 'short', 'other', '',
        'start', to_char(current_date + 24, 'YYYY-MM-DD'), 'end', to_char(current_date + 30, 'YYYY-MM-DD'),
        'mode', 'sequential', 'deadline', 48, 'message', 'I am presenting at a conference for a week. One client, depression, steady, but she values having a named person if anything comes up. Could you be that person for the week?',
        'clients', jsonb_build_array(private.demo_client('Client 1', 'Depression', 'MA', '', 'either', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
      if jsonb_array_length(r -> 'dropped') = 0 then
        plan := (r ->> 'planId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 4, 'kind', 'cover', 'title', 'Sophie Chen asked if you can cover',
          'body', 'Conference week cover, one client. Answer, or ask a question first.', 'view', 'cover', 'id', plan);
      end if;
    elsif p_step = 5 then
      perform private.demo_as(marcus);
      r := public.consult_post(jsonb_build_object(
        'clientRequestId', md5('story-5-' || p_viewer)::uuid, 'title', 'What actually brought your late cancellations down?',
        'body', 'Mine crept up to about one in eight sessions this autumn and reminders alone have not moved it. For those who brought it down: was it the policy itself, how you introduced it in the first session, or something else?',
        'topic', 'Professional life', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'network'));
      cid := (r ->> 'id')::bigint;
      insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 5, 'kind', 'consult', 'title', 'Marcus Reed asked the network a question',
        'body', 'What actually brought your late cancellations down?', 'view', 'consult', 'id', cid);
    elsif p_step = 6 then
      perform private.demo_as(maya);
      r := public.referral_create(jsonb_build_object(
        'requestId', md5('story-v6-6-' || p_viewer)::uuid, 'state', 'NY', 'setting', 'either', 'focus', 'Trauma/PTSD', 'secondary', '', 'age', 'Adults',
        'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
        'timeframe', 'Within two weeks', 'message', 'An adult who is ready for trauma-focused work after a stable year in supportive therapy. My waitlist is full and I would like her with someone I trust. Video or in person both work.', 'prescribing', false));
      if jsonb_array_length(r -> 'dropped') = 0 then
        ref := (r ->> 'referralId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 6, 'kind', 'referral', 'title', 'Maya Patel sent you a referral request',
          'body', 'An adult with trauma in New York. Say whether you can accept, or ask a question.', 'view', 'referrals', 'id', ref);
      end if;
    elsif p_step = 7 then
      perform private.demo_as(imani);
      key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
      perform public.message_send(key, 'Hi Rachel, I hope your week is going well. I have a client moving from New York to Massachusetts in the spring. Would you be open to a short call next week about continuity of care? Nothing urgent.', md5('story-v5-3-' || p_viewer)::uuid);
      conv := private.demo_conv(key);
      insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer) on conflict do nothing;
      out := jsonb_build_object('step', 7, 'kind', 'message', 'title', 'Imani Ambershaw sent you a message',
        'body', 'Would you be open to a short call about a client moving to Massachusetts?', 'view', 'messages', 'key', key);
    elsif p_step = 8 then
      select c.id into cid from consultations c where c.author_profile_id = james and c.client_request_id = md5('seed-consult-few-' || p_viewer)::uuid;
      if cid is not null then
        perform private.demo_as(james);
        perform public.consult_reply(cid, 'Thank you, Rachel. A regular social anchor is exactly the frame I needed. I will try it with two clients this week and tell you how it goes.', md5('story-v5-7-' || p_viewer)::uuid);
        out := jsonb_build_object('step', 8, 'kind', 'consult', 'title', 'James Wilson replied to his question',
          'body', 'Grief work with older adults: he thanked you for your reply.', 'view', 'consult', 'id', cid);
      else
        perform private.demo_as(lena);
        key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
        perform public.message_send(key, 'Hi Rachel, thank you for being open to referrals from Vermont. I will keep you in mind for adults who prefer video.', md5('story-v6-8-' || p_viewer)::uuid);
        conv := private.demo_conv(key);
        insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer) on conflict do nothing;
        out := jsonb_build_object('step', 8, 'kind', 'message', 'title', 'Lena Larkhollow sent you a message',
          'body', 'A thank-you for being open to referrals from Vermont.', 'view', 'messages', 'key', key);
      end if;
    end if;
  exception when others then
    raise warning 'sandbox_story_event(%, %): %', p_viewer, p_step, sqlerrm;
    out := null;
  end;

  perform set_config('pa.sandbox_owner', '', true);
  perform private.demo_restore(saved_claims, saved_sub);
  if pass_id is not null then
    update sandbox_passes set guest_id = p_viewer where id = pass_id;
  end if;
  return out;
end;
$function$;
revoke all on function private.sandbox_story_event(uuid, integer) from public, anon, authenticated;
