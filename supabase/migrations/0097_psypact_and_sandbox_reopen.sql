-- 0097: PSYPACT only where the compact applies; re-opening a sandbox link
-- keeps the sandbox. Applied to both projects.

-- PSYPACT member states (psypact.gov, March 2026). New York and
-- Massachusetts are not members. Review this list before each release.
create or replace function private.psypact_states()
 returns text[]
 language sql
 immutable
as $function$
  select array['AL','AZ','AR','CO','CT','DE','DC','FL','GA','ID','IL','IN','KS','KY','ME','MD','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NC','ND','OH','OK','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']::text[];
$function$;

-- PSYPACT covers psychologists whose home state is a member state.
create or replace function private.psypact_eligible(p_state text, p_qualification text)
 returns boolean
 language sql
 immutable
as $function$
  select coalesce(upper(p_state) = any (private.psypact_states()), false)
     and coalesce(upper(p_qualification), '') not in ('MD', 'DO');
$function$;

-- A flag that can't be true isn't kept.
create or replace function private.normalise_psypact()
 returns trigger
 language plpgsql
as $function$
begin
  if new.psypact_participating and not private.psypact_eligible(new.primary_state, new.qualification_level::text) then
    new.psypact_participating := false;
  end if;
  return new;
end;
$function$;

create trigger profiles_psypact_eligible
  before insert or update of psypact_participating, primary_state, qualification_level on public.profiles
  for each row execute function private.normalise_psypact();

update public.profiles set psypact_participating = false
where psypact_participating and not private.psypact_eligible(primary_state, qualification_level::text);

-- Telehealth across state lines only into a member state (edited in place).
do $do$
declare
  def text := pg_get_functiondef('public.match_pool'::regproc);
  old_clause text := '(coalesce(p_telehealth, true) and p.psypact_participating)';
begin
  if strpos(def, 'psypact_states') > 0 then
    return;
  end if;
  if strpos(def, old_clause) = 0 then
    raise exception 'match_pool clause not found';
  end if;
  execute replace(def, old_clause, '(coalesce(p_telehealth, true) and p.psypact_participating and upper(p_state) = any (private.psypact_states()))');
end
$do$;

-- Alex practises in New York, which isn't a member state (edited in place).
do $do$
declare
  def text := pg_get_functiondef('private.seed_demo_viewer'::regproc);
begin
  if strpos(def, 'psypact_participating = true') > 0 then
    execute replace(def, 'psypact_participating = true', 'psypact_participating = false');
  end if;
end
$do$;

-- Re-opening a sandbox link (another device, a forwarded link) carries on
-- with the same sandbox: a fresh one-off password for the same guest, and
-- other devices stay signed in. Starting over is "Start the story again".
create or replace function public.claim_sandbox(p_token text)
 returns table(email text, password text, expires_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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

  if pass.guest_id is not null then
    select u.email into gmail from auth.users u where u.id = pass.guest_id;
    if gmail is not null then
      update auth.users set encrypted_password = crypt(pw, gen_salt('bf')), updated_at = now() where id = pass.guest_id;
      update sandbox_passes set claimed_at = now(), claims = claims + 1 where id = pass.id;
      return query select gmail, pw, pass.expires_at;
      return;
    end if;
  end if;

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
    verification_status, verified_at, is_demo, account_status, account_kind, directory_visible)
  values (gid, 'Alex Rivers', 'Dr.', 'PsyD', 'NY', 'Brooklyn', array['NY', 'NJ'], 'verified', now(), true, 'active', 'clinician', true)
  on conflict (id) do nothing;

  perform private.seed_demo_viewer(gid);
  update sandbox_passes set guest_id = gid, claimed_at = now(), claims = claims + 1 where id = pass.id;
  return query select gmail, pw, pass.expires_at;
end;
$function$;
