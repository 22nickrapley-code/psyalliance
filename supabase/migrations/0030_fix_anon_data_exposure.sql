-- Security fix (found via a Supabase security-advisor sweep + manual RLS
-- review): two SELECT policies meant to let signed-in members browse
-- *other* verified colleagues were missing the auth.role() = 'authenticated'
-- guard that the equivalent policies elsewhere in the schema (documents,
-- document_treatment_areas) already have. Postgres RLS policies are
-- evaluated per-role but these applied to {public} with no role check in
-- the qual itself, so the unauthenticated "anon" role - the public API key
-- baked into every page's client bundle - could read every verified
-- practitioner's full profile row (name, NPI number, phone, email, practice
-- website, etc.) and their availability schedule with zero login, directly
-- over the REST API. That's a serious leak for a product whose whole
-- premise is a closed, credential-verified network rather than an open
-- directory. Tightening both to require an authenticated session.
alter policy "verified profiles are readable by any authenticated user" on public.profiles
  using (
    verification_status = 'verified'
    and (select auth.role()) = 'authenticated'
  );

alter policy "verified profiles' availability is readable by any authenticate" on public.profile_availability
  using (
    exists (
      select 1 from profiles p
      where p.id = profile_availability.profile_id
        and p.verification_status = 'verified'
    )
    and (select auth.role()) = 'authenticated'
  );

-- Defense in depth on top of the RLS fix above:
--
-- public_directory is a SECURITY DEFINER view, so it bypasses profiles' RLS
-- entirely regardless of the fix above - its own grants are the only gate,
-- and it had the default anon SELECT grant every new relation gets in this
-- project, meaning the same data was independently exposed a second way.
-- community_endorsement_scores isn't SECURITY DEFINER but had the same
-- default anon grant; revoking it too so both views require a login, like
-- every other member-facing surface.
revoke all on public.public_directory from anon;
revoke all on public.community_endorsement_scores from anon;
grant select on public.public_directory to authenticated;
grant select on public.community_endorsement_scores to authenticated;

-- is_admin_user / is_conversation_participant are SECURITY DEFINER helper
-- functions used inside other RLS policies (needed to check
-- profiles.is_admin from within a profiles policy without infinite
-- recursion). SQL functions default to PUBLIC execute, so both were
-- directly callable over the anon-key REST RPC endpoint
-- (/rest/v1/rpc/is_admin_user etc.) by anyone, letting an unauthenticated
-- caller probe arbitrary profile/conversation ids. Revoking PUBLIC execute
-- closes the direct RPC path; authenticated keeps execute since RLS
-- policies still need to call these while a logged-in user queries the
-- tables that reference them.
revoke execute on function public.is_admin_user(uuid) from public;
revoke execute on function public.is_conversation_participant(bigint, uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated;
grant execute on function public.is_conversation_participant(bigint, uuid) to authenticated;
