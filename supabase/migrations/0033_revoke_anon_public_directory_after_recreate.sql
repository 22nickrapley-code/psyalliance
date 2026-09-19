-- Applied directly against the remote project immediately after 0032 was
-- run there (before this file existed locally) - recorded here so the
-- local migration history matches what's actually applied. See 0032's own
-- revoke, added after this incident, for the full explanation: dropping
-- and recreating public_directory picks up Supabase's default privileges,
-- which grant anon a full set of privileges on any newly created object
-- regardless of what the migration's own GRANT says.
revoke all on public.public_directory from anon;
grant select on public.public_directory to authenticated;
