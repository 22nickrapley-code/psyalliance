-- Release check: demo sandbox passes (migration 0086). Run on the DEMO
-- project, or on production inside this rolled-back transaction (it sets
-- app_env = 'demo' temporarily). Needs the 120 demo members seeded.
do $$
declare out text := ''; tok text; r record; g uuid; ref bigint; n int;
begin
  insert into app_config (key, value) values ('app_env', 'demo') on conflict (key) do update set value = 'demo';
  insert into sandbox_passes (label) values ('Test prospect') returning token into tok;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select * into r from claim_sandbox(tok);
  reset role;
  select guest_id into g from sandbox_passes where token = tok;
  out := out || E'\nok   claimed: ' || r.email || ' pw_len=' || length(r.password);
  out := out || E'\nok   guest story: plans=' || (select count(*) from coverage_plans where profile_id = g)
     || ' referrals_in=' || (select count(*) from referral_requests where g = any(audience_profile_ids))
     || ' my_refs=' || (select count(*) from referral_requests where requesting_profile_id = g)
     || ' consults=' || (select count(*) from consultations where author_profile_id = g)
     || ' trusted=' || (select count(*) from connections where g in (requester_id, addressee_id) and status = 'accepted')
     || ' convos=' || (select count(*) from conversation_participants where profile_id = g)
     || ' notifs=' || (select count(*) from notification_deliveries where recipient_profile_id = g);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := out || E'\nok   guest sees directory=' || (select count(distinct id) from public_directory) || ' my_sandbox=' || (select label from my_sandbox());
  insert into referral_requests (requesting_profile_id, state, status, audience_type, modality, notes) values (g, 'TX', 'sent', 'wider_network', 'either', 'Adult, anxiety') returning id into ref;
  insert into consultations (author_profile_id, question, audience_type, status, deidentification_confirmed) values (g, 'How do you pace exposure work?', 'wider_network', 'open', true);
  insert into consultation_groups (name, created_by, charter_body) values ('Guest group', g, 'Charter');
  begin insert into consultation_group_members (group_id, external_email, status, role) select id, 'x@example.com', 'invited', 'member' from consultation_groups where created_by = g limit 1;
    out := out || E'\nFAIL guest invited by email';
  exception when others then out := out || E'\nok   email invites blocked: ' || left(sqlerrm, 50); end;
  begin perform admin_members(); out := out || E'\nok   admin_members returns ' || (select count(*) from admin_members()) || ' rows to a guest';
  exception when others then out := out || E'\nok   guest has no admin access'; end;
  reset role;
  update referral_requests set created_at = now() - interval '5 minutes' where id = ref;
  update consultations set created_at = now() - interval '5 minutes' where author_profile_id = g and status = 'open';
  n := private.demo_autorespond();
  out := out || E'\nok   autorespond acted=' || n || ' replies on new referral=' || (select count(*) from referral_responses where referral_request_id = ref)
     || ' consult replies=' || (select count(*) from consultation_responses cr join consultations c on c.id = cr.consultation_id where c.author_profile_id = g and c.question like 'How do you pace%')
     || ' cover case statuses=' || (select string_agg(c.status::text, ',') from coverage_plan_cases c join coverage_plans p on p.id = c.coverage_plan_id where p.profile_id = g);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform reset_my_sandbox();
  reset role;
  out := out || E'\nok   after reset: my_refs=' || (select count(*) from referral_requests where requesting_profile_id = g) || ' consults=' || (select count(*) from consultations where author_profile_id = g) || ' groups_mine=' || (select count(*) from consultation_groups where created_by = g);
  update app_config set value = 'production' where key = 'app_env';
  begin perform claim_sandbox(tok); out := out || E'\nFAIL claimed outside demo';
  exception when others then out := out || E'\nok   refused outside the demo site'; end;
  update sandbox_passes set expires_at = now() - interval '1 minute' where token = tok;
  update app_config set value = 'demo' where key = 'app_env';
  n := private.sandbox_cleanup();
  out := out || E'\nok   cleanup removed=' || n || ' guest left=' || (select count(*) from auth.users where id = g);
  raise exception 'RESULT%', out;
end $$;
