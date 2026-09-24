-- Release check: network write paths. Creates three throwaway real
-- accounts inside one transaction, tries each action, and always rolls
-- back. R1: verified, reviewed NY licence. R2: verified, reviewed TX
-- licence. R3: pending, no licence.
do $$
declare
  out text := '';
  r1 uuid := gen_random_uuid();
  r2 uuid := gen_random_uuid();
  r3 uuid := gen_random_uuid();
  r4 uuid := gen_random_uuid();
  r5 uuid := gen_random_uuid();
  demo uuid := gen_random_uuid();
  ref_id bigint; con_id bigint; conv_id bigint; plan_id bigint; case_ny bigint; case_tx bigint; ev_id bigint;
  procedure_ok boolean;

begin
  -- throwaway accounts skip the invitation gate (rolled back with the rest)
  insert into app_config (key, value) values ('signup_mode', 'open') on conflict (key) do update set value = 'open';
  insert into auth.users (id, email, aud, role) values
    (r1, 'r1@release-check.test', 'authenticated', 'authenticated'),
    (r2, 'r2@release-check.test', 'authenticated', 'authenticated'),
    (r3, 'r3@release-check.test', 'authenticated', 'authenticated'),
    (r4, 'r4@release-check.test', 'authenticated', 'authenticated'),
    (r5, 'r5@release-check.test', 'authenticated', 'authenticated'),
    (demo, 'demo@release-check.test', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, qualification_level, verification_status, primary_state) values
    (r1, 'Check One', 'PhD', 'verified', 'NY'),
    (r2, 'Check Two', 'PsyD', 'verified', 'TX'),
    (r3, 'Check Three', 'PhD', 'pending', 'NY'),
    (r4, 'Check Four', 'MD', 'verified', 'NY')
  on conflict (id) do update set verification_status = excluded.verification_status;
  insert into profiles (id, full_name, qualification_level, verification_status, primary_state, is_demo) values (demo, 'Check Demo', 'PhD', 'verified', 'NY', true);
  insert into licenses (profile_id, state, license_number, status, reviewed_at) values
    (r1, 'NY', 'X1', 'active', now()), (r2, 'TX', 'X2', 'active', now()), (r4, 'NY', 'X4', 'active', now());

  -- helper: run as a member
  -- (inline: set claims, set role, try, record, reset)

  -- 1. Pending can't send a referral
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into referral_requests (requesting_profile_id, state, status, audience_type) values (r3, 'NY', 'open', 'wider_network');
    out := out || E'\nFAIL pending sent a referral';
  exception when others then out := out || E'\nok   pending cannot send a referral';
  end;
  -- 2. Pending can save a private consult draft but not publish
  begin
    insert into consultations (author_profile_id, question, audience_type, status) values (r3, 'Draft question', 'wider_network', 'draft');
    out := out || E'\nok   pending can save a consult draft';
  exception when others then out := out || E'\nFAIL pending draft blocked: ' || sqlerrm;
  end;
  begin
    insert into consultations (author_profile_id, question, audience_type, status) values (r3, 'Published question', 'wider_network', 'open');
    out := out || E'\nFAIL pending published a consult';
  exception when others then out := out || E'\nok   pending cannot publish a consult';
  end;
  -- 3. Pending can't message or invite
  begin
    insert into conversations (created_by, title) values (r3, 't') returning id into conv_id;
    insert into conversation_participants (conversation_id, profile_id) values (conv_id, r3), (conv_id, r1);
    out := out || E'\nFAIL pending started a conversation with a member';
  exception when others then out := out || E'\nok   pending cannot message members';
  end;
  begin
    insert into connections (requester_id, addressee_id, tier, status) values (r3, r1, 'trusted_colleague', 'pending');
    out := out || E'\nFAIL pending sent an invitation';
  exception when others then out := out || E'\nok   pending cannot invite colleagues';
  end;
  -- 4. Pending can't raise notifications (no email spoofing)
  begin
    insert into notification_events (event_type, actor_profile_id, summary, deep_link) values ('message_received', r3, 'x', '/dashboard');
    out := out || E'\nFAIL pending raised a notification';
  exception when others then out := out || E'\nok   pending cannot raise notifications';
  end;
  -- 5. Pending can still edit own profile, including private contact fields
  begin
    update profiles set contact_email = 'me@practice.test', bio = 'Hello' where id = r3;
    out := out || E'\nok   pending can edit own profile';
  exception when others then out := out || E'\nFAIL pending profile edit: ' || sqlerrm;
  end;
  reset role;
  -- a brand-new account creates its profile with a plain insert, and can't
  -- insert itself as verified, admin or operator
  perform set_config('request.jwt.claims', json_build_object('sub', r5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into profiles (id, full_name, contact_email, verification_status, is_admin, account_kind)
    values (r5, 'Check Five', 'five@practice.test', 'verified', true, 'operator');
    if (select verification_status::text || is_admin::text || account_kind from my_profile()) = 'pendingfalseclinician' then
      out := out || E'\nok   new account creates its profile, cannot insert itself as verified/admin';
    else out := out || E'\nFAIL new account inserted privileged profile'; end if;
  exception when others then out := out || E'\nFAIL new profile insert: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update profiles set verification_status = 'verified', is_admin = true, account_kind = 'operator' where id = r3;
    if (select verification_status from profiles where id = r3) = 'pending' and not (select is_admin from profiles where id = r3) then
      out := out || E'\nok   pending cannot self-verify or self-promote';
    else out := out || E'\nFAIL pending self-verified'; end if;
  exception when others then out := out || E'\nok   pending cannot self-verify (error)';
  end;
  reset role;

  -- 6. Verified NY member sends a TX in-person referral; TX member sees it,
  --    NY-only member can't take it.
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into referral_requests (requesting_profile_id, state, status, audience_type, modality) values (r2, 'TX', 'open', 'wider_network', 'in_person') returning id into ref_id;
    out := out || E'\nok   verified member can send a referral';
  exception when others then out := out || E'\nFAIL verified referral: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from referral_requests where id = ref_id) then
    out := out || E'\nFAIL NY member sees a TX in-person referral';
  else out := out || E'\nok   NY-only member does not see a TX in-person referral'; end if;
  begin
    insert into referral_responses (referral_request_id, responding_profile_id, status) values (ref_id, r1, 'interested');
    out := out || E'\nFAIL NY member replied to a TX in-person referral';
  exception when others then out := out || E'\nok   NY-only member cannot take a TX in-person referral';
  end;
  -- 7. Verified members connect, message and consult
  begin
    insert into connections (requester_id, addressee_id, tier, status) values (r1, r2, 'trusted_colleague', 'pending');
    out := out || E'\nok   verified member can invite a verified colleague';
  exception when others then out := out || E'\nFAIL verified invite: ' || sqlerrm;
  end;
  begin
    insert into connections (requester_id, addressee_id, tier, status) values (r1, r3, 'trusted_colleague', 'pending');
    out := out || E'\nFAIL member invited a pending account';
  exception when others then out := out || E'\nok   cannot invite a pending account';
  end;
  begin
    insert into connections (requester_id, addressee_id, tier, status) values (r1, demo, 'trusted_colleague', 'pending');
    out := out || E'\nFAIL real member invited a demo account';
  exception when others then out := out || E'\nok   real member cannot invite a demo account';
  end;
  begin
    insert into conversations (created_by, title) values (r1, 't') returning id into conv_id;
    insert into conversation_participants (conversation_id, profile_id) values (conv_id, r1), (conv_id, r2);
    insert into conversation_messages (conversation_id, author_id, body) values (conv_id, r1, 'Hello');
    out := out || E'\nok   verified members can message each other';
  exception when others then out := out || E'\nFAIL verified messaging: ' || sqlerrm;
  end;
  begin
    insert into conversations (created_by, title) values (r1, 't') returning id into conv_id;
    insert into conversation_participants (conversation_id, profile_id) values (conv_id, r1), (conv_id, demo);
    out := out || E'\nFAIL real member messaged a demo account';
  exception when others then out := out || E'\nok   real member cannot message a demo account';
  end;
  begin
    insert into consultations (author_profile_id, question, audience_type, status) values (r1, 'A real question', 'wider_network', 'open');
    out := out || E'\nok   verified member can publish a consult';
  exception when others then out := out || E'\nFAIL verified consult: ' || sqlerrm;
  end;
  -- 8. Cover outreach needs a relevant licence
  begin
    insert into coverage_plans (profile_id, title, starts_on, ends_on, jurisdiction_state) values (r1, 'Leave', current_date, current_date + 30, 'NY') returning id into plan_id;
    insert into coverage_plan_cases (coverage_plan_id, case_reference, modality) values (plan_id, 'Case 1', 'in_person') returning id into case_ny;
    begin
      insert into coverage_requests (coverage_plan_case_id, requested_profile_id, status) values (case_ny, r2, 'sent');
      out := out || E'\nFAIL TX-only colleague asked to cover an NY in-person case';
    exception when others then out := out || E'\nok   cannot ask a colleague without a licence in the case state';
    end;
    begin
      insert into coverage_requests (coverage_plan_case_id, requested_profile_id, status) values (case_ny, r4, 'sent');
      out := out || E'\nok   can ask an NY-licensed colleague to cover an NY case';
    exception when others then out := out || E'\nFAIL cover outreach to licensed colleague: ' || sqlerrm;
    end;
    begin
      insert into coverage_requests (coverage_plan_case_id, requested_profile_id, status) values (case_ny, r3, 'sent');
      out := out || E'\nFAIL pending colleague asked to cover';
    exception when others then out := out || E'\nok   cannot ask a pending account for cover';
    end;
    begin
      insert into coverage_requests (coverage_plan_case_id, requested_profile_id, status) values (case_ny, demo, 'sent');
      out := out || E'\nFAIL demo colleague asked to cover a real case';
    exception when others then out := out || E'\nok   cannot ask a demo account to cover a real case';
    end;
  exception when others then out := out || E'\nFAIL cover setup: ' || sqlerrm;
  end;
  -- 8b. The full loop with another eligible clinician (r4, NY)
  declare nyref bigint; cons bigint;
  begin
    insert into referral_requests (requesting_profile_id, state, status, audience_type, modality) values (r1, 'NY', 'open', 'wider_network', 'in_person') returning id into nyref;
    select id into cons from consultations where author_profile_id = r1 limit 1;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', r4, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into referral_responses (referral_request_id, responding_profile_id, status, message) values (nyref, r4, 'interested', 'I can take this');
    insert into consultation_responses (consultation_id, responder_profile_id, response_type, body) values (cons, r4, 'reply', 'Here is my thinking');
    update coverage_requests set status = 'accepted', responded_at = now() where requested_profile_id = r4 and coverage_plan_case_id = case_ny;
    reset role;
    out := out || E'\nok   full loop with an eligible colleague: referral reply=' || (select count(*) from referral_responses where referral_request_id = nyref)
      || ', consult reply=' || (select count(*) from consultation_responses where consultation_id = cons)
      || ', cover case=' || (select status::text from coverage_plan_cases where id = case_ny);
    perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
    set local role authenticated;
  exception when others then out := out || E'\nFAIL full loop: ' || sqlerrm;
  end;
  -- 9. Notifications: only on-site links, only within partition
  begin
    insert into notification_events (event_type, actor_profile_id, summary, deep_link) values ('message_received', r1, 'x', '//evil.example') returning id into ev_id;
    out := out || E'\nFAIL off-site email link accepted';
  exception when others then out := out || E'\nok   off-site email links rejected';
  end;
  begin
    insert into notification_events (event_type, actor_profile_id, summary, deep_link) values ('message_received', r1, 'sent you a message', '/dashboard/messages') returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status) values (ev_id, r2, 'in_app', 'sent');
    out := out || E'\nok   member notifies a member';
    begin
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status) values (ev_id, demo, 'email', 'pending');
      out := out || E'\nFAIL real member emailed a demo account';
    exception when others then out := out || E'\nok   real member cannot notify a demo account';
    end;
  exception when others then out := out || E'\nFAIL member notification: ' || sqlerrm;
  end;
  begin
    insert into notification_events (event_type, actor_profile_id, summary) values ('availability_reminder', r1, 'x');
    out := out || E'\nFAIL member raised a system event';
  exception when others then out := out || E'\nok   members cannot raise system events';
  end;
  reset role;

  raise exception 'RESULT%', out;
end $$;
