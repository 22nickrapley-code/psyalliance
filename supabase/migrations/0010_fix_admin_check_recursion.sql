-- Critical fix: the existing admin RLS policies on profiles and
-- credential_verifications check admin status with a raw subquery against
-- profiles itself:
--   exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin)
-- Because that subquery selects from the SAME RLS-protected table, Postgres
-- has to apply profiles' own SELECT policies to evaluate it - including
-- "admins can see all profiles", which contains the identical subquery,
-- which needs its own policies evaluated, and so on.
--
-- Confirmed by actually testing as the `authenticated` role (not the
-- elevated service role migrations run as, which bypasses RLS entirely and
-- never hit this): Postgres raises "infinite recursion detected in policy
-- for relation profiles" the moment these policies are evaluated by a real
-- signed-in user. This would have broken every admin action - approving a
-- profile, or even just the dashboard nav bar's is_admin check - the first
-- time it was exercised by real traffic instead of a service-role migration.
--
-- Fix: move the admin check into a SECURITY DEFINER helper function. Owned
-- by the migration role (which owns the table), it bypasses profiles' RLS
-- for its own internal lookup instead of re-entering the policy system.

create or replace function is_admin_user(check_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = check_id), false);
$$;

-- Needed by authenticated/anon so the policies below can call it while
-- being evaluated under those roles; this necessarily makes it
-- advisor-flagged as a publicly-callable SECURITY DEFINER function, same
-- as public_directory's intentional security-definer view - it only ever
-- returns a boolean for a given id, nothing sensitive is exposed.
grant execute on function is_admin_user(uuid) to authenticated, anon;

drop policy "admins can update any profile's verification status" on profiles;
create policy "admins can update any profile's verification status" on profiles
  for update using (is_admin_user((select auth.uid())));

drop policy "admins can see all profiles" on profiles;
create policy "admins can see all profiles" on profiles
  for select using (is_admin_user((select auth.uid())));

drop policy "admins can see all credential verifications" on credential_verifications;
create policy "admins can see all credential verifications" on credential_verifications
  for select using (is_admin_user((select auth.uid())));

drop policy "admins can update credential verifications" on credential_verifications;
create policy "admins can update credential verifications" on credential_verifications
  for update using (is_admin_user((select auth.uid())));

-- Route the profile-column-protection trigger (0009) through the same
-- helper for one shared source of truth. It was already a SECURITY DEFINER
-- function owned by the table owner, so it likely bypassed RLS on its own,
-- but this removes any doubt and keeps the admin check in one place.
create or replace function protect_admin_controlled_profile_columns()
returns trigger as $$
begin
  if not is_admin_user((select auth.uid())) then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
