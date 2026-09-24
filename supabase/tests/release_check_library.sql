-- Release check: Library review governance. Throwaway accounts, always
-- rolls back. Uses the first operator admin and PA-04.
do $$
declare
  out text := '';
  adm uuid := (select id from profiles where is_admin and account_kind = 'operator' order by created_at limit 1);
  r1 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  doc record;
begin
  -- throwaway accounts skip the invitation gate (rolled back with the rest)
  insert into app_config (key, value) values ('signup_mode', 'open') on conflict (key) do update set value = 'open';
  insert into auth.users (id, email, aud, role) values (r1, 'r1@release-check.test', 'authenticated', 'authenticated'), (r3, 'r3@release-check.test', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, qualification_level, verification_status) values (r1, 'Check One', 'PhD', 'verified'), (r3, 'Check Three', 'PhD', 'pending');
  insert into licenses (profile_id, state, license_number, status, reviewed_at) values (r1, 'NY', 'X1', 'active', now());
  select * into doc from documents where library_code = 'PA-04';
  update documents set required_reviewer_roles = array['clinical'] where id = doc.id;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into library_reviewers (profile_id, role, qualification) values (adm, 'legal_regulatory', 'Self appointed'); out := out || E'\nFAIL admin self-appointed';
  exception when others then out := out || E'\nok   admin cannot self-appoint'; end;
  begin insert into library_reviewers (profile_id, role, qualification) values (r3, 'clinical', 'Pending person'); out := out || E'\nFAIL pending appointed clinical';
  exception when others then out := out || E'\nok   pending account cannot be a clinical reviewer'; end;
  begin insert into library_reviewers (profile_id, role, qualification) values (r1, 'prescribing', 'PhD psychologist'); out := out || E'\nFAIL PhD appointed prescribing';
  exception when others then out := out || E'\nok   PhD cannot be a prescribing reviewer'; end;
  insert into library_reviewers (profile_id, role, qualification) values (r1, 'clinical', 'NY licensed psychologist'), (r1, 'legal_regulatory', 'Also claims legal');
  out := out || E'\nok   admin appoints a licensed clinician';
  begin insert into document_reviews (document_id, document_version, reviewer_role, reviewer_profile_id, approved) values (doc.id, doc.version, 'clinical', adm, true); out := out || E'\nFAIL unappointed admin recorded a review';
  exception when others then out := out || E'\nok   unappointed admin cannot review'; end;
  begin update documents set review_status = 'published', review_date = current_date where id = doc.id; out := out || E'\nFAIL published without review';
  exception when others then out := out || E'\nok   cannot publish without an independent approval'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into document_reviews (document_id, document_version, reviewer_role, reviewer_profile_id, approved, notes) values (doc.id, doc.version - 1, 'clinical', r1, true, 'old'); out := out || E'\nFAIL reviewed an old version';
  exception when others then out := out || E'\nok   cannot review an old version'; end;
  insert into document_reviews (document_id, document_version, reviewer_role, reviewer_profile_id, approved, notes) values (doc.id, doc.version, 'clinical', r1, true, 'Checked the whole charter');
  out := out || E'\nok   appointed clinician records a clinical approval';
  begin insert into document_reviews (document_id, document_version, reviewer_role, reviewer_profile_id, approved, notes) values (doc.id, doc.version, 'legal_regulatory', r1, true, 'x'); out := out || E'\nFAIL same person approved two roles';
  exception when others then out := out || E'\nok   same person cannot approve a second role'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update documents set review_status = 'published', review_date = current_date where id = doc.id; out := out || E'\nok   publishes after an independent approval';
  exception when others then out := out || E'\nFAIL publish after approval: ' || sqlerrm; end;
  update documents set summary = coalesce(summary, '') || ' (edited)' where id = doc.id;
  out := out || E'\nok   editing published content -> ' || (select review_status || ' v' || version from documents where id = doc.id);
  reset role;
  raise exception 'RESULT%', out;
end $$;
