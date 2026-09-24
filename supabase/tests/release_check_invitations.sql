-- Release check: invitation-only sign-up (enforce_invitation on auth.users).
-- Always rolls back.
do $$
declare out text := ''; tok text; tok2 text;
begin
  insert into app_config (key, value) values ('signup_mode', 'invite') on conflict (key) do update set value = 'invite';
  insert into cohort_invitations (email, full_name) values ('invitee@release-check.test', 'Invitee') returning token into tok;
  insert into cohort_invitations (full_name) values ('Open invite') returning token into tok2;
  begin insert into auth.users (id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'nobody@release-check.test', 'authenticated', 'authenticated', '{}'); out := out || E'\nFAIL signup without invitation';
  exception when others then out := out || E'\nok   sign-up without an invitation is refused'; end;
  begin insert into auth.users (id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'other@release-check.test', 'authenticated', 'authenticated', jsonb_build_object('invite', tok)); out := out || E'\nFAIL invitation used by a different email';
  exception when others then out := out || E'\nok   an invitation bound to one email refuses another'; end;
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'invitee@release-check.test', 'authenticated', 'authenticated', jsonb_build_object('invite', tok));
  out := out || E'\nok   invited email signs up; redeemed=' || (select (redeemed_at is not null)::text from cohort_invitations where token = tok);
  begin insert into auth.users (id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'again@release-check.test', 'authenticated', 'authenticated', jsonb_build_object('invite', tok)); out := out || E'\nFAIL invitation reused';
  exception when others then out := out || E'\nok   an invitation works once'; end;
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'open@release-check.test', 'authenticated', 'authenticated', jsonb_build_object('invite', tok2));
  out := out || E'\nok   an unbound invitation works for any email';
  perform request_to_join('Dr Test', 'Test@Release-Check.test', 'PhD', 'NY', 'Hi');
  perform request_to_join('Dr Test', 'test@release-check.test', 'PhD', 'NY', 'Hi again');
  out := out || E'\nok   join requests dedupe by email: ' || (select count(*) from join_requests where email = 'test@release-check.test');
  raise exception 'RESULT%', out;
end $$;
