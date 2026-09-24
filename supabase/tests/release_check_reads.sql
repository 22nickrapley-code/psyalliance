-- Release check: what each kind of account can read. Runs in one
-- transaction and always rolls back (the result comes back as the error
-- message). Viewers: admin operator, demo-view test account, verified
-- demo member, pending demo member, suspended member.
do $$
declare
  out text := '';
  v uuid;
  n int;
  label text;
  admin_id uuid := (select id from profiles where is_admin and account_kind = 'operator' order by created_at limit 1);
  demo_viewer uuid := (select id from profiles where demo_view and not is_demo limit 1);
  verified_demo uuid := (select id from profiles where is_demo and verification_status = 'verified' order by id limit 1);
  pending_demo uuid := (select id from profiles where is_demo and verification_status = 'verified' order by id offset 1 limit 1);
  suspended_demo uuid := (select id from profiles where is_demo and verification_status = 'verified' order by id offset 2 limit 1);
begin
  update profiles set verification_status = 'pending' where id = pending_demo;
  update profiles set account_status = 'suspended' where id = suspended_demo;
  for label, v in
    select * from (values ('admin', admin_id), ('demo_view', demo_viewer), ('verified', verified_demo), ('pending', pending_demo), ('suspended', suspended_demo)) t(l, i) where i is not null
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
    set local role authenticated;
    out := out || E'\n' || label || ':';
    select count(*) into n from profiles; out := out || ' profiles=' || n;
    begin
      select count(contact_email) into n from profiles; out := out || ' contact_email=READABLE';
    exception when insufficient_privilege then out := out || ' contact_email=denied'; end;
    begin
      select count(caqh_provider_id) into n from profiles; out := out || ' caqh=READABLE';
    exception when insufficient_privilege then out := out || ' caqh=denied'; end;
    select count(*) into n from my_profile(); out := out || ' my_profile=' || n;
    select count(*) into n from admin_profiles(); out := out || ' admin_profiles=' || n;
    select count(distinct id) into n from public_directory; out := out || ' directory=' || n;
    select count(*) into n from network_licence_states(); out := out || ' licence_states=' || n;
    select count(*) into n from consultations where author_profile_id <> v; out := out || ' others_consults=' || n;
    select count(*) into n from consultation_responses where responder_profile_id <> v; out := out || ' others_replies=' || n;
    select count(*) into n from referral_requests where requesting_profile_id <> v; out := out || ' others_referrals=' || n;
    select count(*) into n from professional_events; out := out || ' prof_events=' || n;
    select count(*) into n from profile_lookup_values where profile_id <> v; out := out || ' others_facts=' || n;
    select count(*) into n from endorsements; out := out || ' endorsements=' || n;
    select count(*) into n from town_hall_messages; out := out || ' town_hall=' || n;
    reset role;
  end loop;
  raise exception 'RESULT%', out;
end $$;
