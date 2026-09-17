-- Critical fix: verification_status, verified_at, and is_admin on `profiles`
-- were owner-writable.
--
-- RLS on `profiles` has two permissive UPDATE policies: "own profile only"
-- (auth.uid() = id, no column restriction) and "admins can update any
-- profile's verification status" (admin-only). Postgres combines multiple
-- permissive policies for the same command with OR - including their WITH
-- CHECK clauses. Since "own profile only"'s WITH CHECK is satisfied by any
-- update where auth.uid() = id, regardless of which columns changed, a
-- signed-in user could call the Supabase REST API directly (bypassing the
-- app's UI entirely, which never exposes these fields in the profile form)
-- and set their OWN verification_status to 'verified', or - far worse -
-- set is_admin to true and grant themselves full admin access to the
-- credential verification queue and every profile on the platform.
--
-- RLS has no native per-column policies, so the fix is a trigger: it lets
-- the owner update every other column on their own row exactly as before,
-- but silently clamps verification_status/verified_at/is_admin back to
-- their prior value whenever the acting user isn't an admin. An admin's
-- own update (via setProfileVerificationStatus) is unaffected because the
-- admin check looks up the ACTING user's row (auth.uid()), not the row
-- being changed.

create or replace function protect_admin_controlled_profile_columns()
returns trigger as $$
begin
  if not exists (
    select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin
  ) then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists clamp_admin_controlled_profile_columns on profiles;
create trigger clamp_admin_controlled_profile_columns
  before update on profiles
  for each row execute function protect_admin_controlled_profile_columns();

-- Trigger functions are invoked by the trigger mechanism itself, not by the
-- calling role's own privileges, so this revoke doesn't break the trigger -
-- it only stops PostgREST from exposing it as a directly-callable RPC
-- endpoint (Supabase's security advisor flags any SECURITY DEFINER function
-- left callable by anon/authenticated as a public API route).
revoke execute on function protect_admin_controlled_profile_columns() from public, anon, authenticated;
