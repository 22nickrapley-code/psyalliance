-- Release check: what each kind of account can read. Creates throwaway
-- accounts inside one transaction and always rolls back (the result comes
-- back as the error message). Viewers: admin operator, verified member,
-- pending member, suspended member, demo member.
do $$
declare
  out text := '';
  v uuid; n int; label text;
  admin_id uuid := (select id from profiles where is_admin and account_kind = 'operator' order by created_at limit 1);
  verified uuid := gen_random_uuid();
  colleague uuid := gen_random_uuid();
  pending uuid := gen_random_uuid();
  suspended uuid := gen_random_uuid();
  demo uuid := gen_random_uuid();
begin
  insert into app_config (key, value) values ('signup_mode', 'open') on conflict (key) do update set value = 'open';
  insert into auth.users (id, email, aud, role) select x, x::text || '@release-check.test', 'authenticated', 'authenticated' from unnest(array[verified, colleague, pending, suspended, demo]) x;
  insert into profiles (id, full_name, qualification_level, verification_status, account_status, is_demo, primary_state, contact_email, caqh_provider_id) values
    (verified, 'Check Verified', 'PhD', 'verified', 'active', false, 'NY', 'v@practice.test', 'CAQH-1'),
    (colleague, 'Check Colleague', 'PsyD', 'verified', 'active', false, 'NY', 'c@practice.test', 'CAQH-2'),
    (pending, 'Check Pending', 'PhD', 'pending', 'active', false, 'NY', 'p@practice.test', null),
    (suspended, 'Check Suspended', 'PhD', 'verified', 'suspended', false, 'NY', 's@practice.test', null),
    (demo, 'Check Demo', 'MD', 'verified', 'active', true, 'NY', 'd@practice.test', null);
  insert into licenses (profile_id, state, license_number, status, reviewed_at) values
    (verified, 'NY', 'L1', 'active', now()), (colleague, 'NY', 'L2', 'active', now()), (suspended, 'NY', 'L3', 'active', now()), (demo, 'NY', 'L4', 'active', now());
  insert into profile_lookup_values (profile_id, lookup_value_id) select x, (select min(id) from lookup_values where category = 'treatment_specialism') from unnest(array[verified, colleague, demo]) x;
  insert into consultations (author_profile_id, question, audience_type, status) values (colleague, 'Real wider-network question', 'wider_network', 'open'), (demo, 'Demo wider-network question', 'wider_network', 'open');
  insert into referral_requests (requesting_profile_id, state, status, audience_type, modality) values (colleague, 'NY', 'open', 'wider_network', 'in_person'), (demo, 'NY', 'open', 'wider_network', 'in_person');

  for label, v in
    select * from (values ('admin', admin_id), ('verified', verified), ('pending', pending), ('suspended', suspended), ('demo', demo)) t(l, i) where i is not null
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
    set local role authenticated;
    out := out || E'\n' || rpad(label || ':', 11);
    select count(*) into n from profiles where id <> v and full_name like 'Check %'; out := out || ' others=' || n;
    begin
      select count(contact_email) into n from profiles; out := out || ' contact_email=READABLE';
    exception when insufficient_privilege then out := out || ' contact_email=denied'; end;
    begin
      select count(caqh_provider_id) into n from profiles; out := out || ' caqh=READABLE';
    exception when insufficient_privilege then out := out || ' caqh=denied'; end;
    select count(*) into n from my_profile(); out := out || ' own=' || n;
    select count(*) into n from admin_profiles() where full_name like 'Check %'; out := out || ' admin_view=' || n;
    select count(distinct id) into n from public_directory where full_name like 'Check %'; out := out || ' directory=' || n;
    select count(*) into n from consultations where author_profile_id <> v and question like '%wider-network question'; out := out || ' consults=' || n;
    select count(*) into n from referral_requests where requesting_profile_id <> v and requesting_profile_id in (colleague, demo); out := out || ' referrals=' || n;
    reset role;
  end loop;
  raise exception 'RESULT (expected: verified sees the real colleague only; pending and suspended see nothing; demo sees demo only; private columns denied to all; admin_view only for admin)%', out;
end $$;
