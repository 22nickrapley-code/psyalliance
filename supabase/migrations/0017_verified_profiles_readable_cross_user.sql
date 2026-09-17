-- Fixes a latent bug spanning several features (Network, Referrals, Town
-- Hall, Planner): profiles has only ever had an "own profile only" policy,
-- so any PostgREST embed of profiles from another table (e.g.
-- connections.select("*, requester:requester_id(full_name)")) silently
-- returns null for anyone other than that profile's own owner - names go
-- blank for the counterparty in every cross-user view. This was never
-- caught because prior real-role RLS tests checked isolation (can't see/
-- edit others' data) but not this "can I see a name I'm supposed to see"
-- case.
--
-- Fix: add an additional permissive SELECT policy (multiple permissive
-- policies OR together, per the RLS lesson from migration 0009/0010) that
-- exposes a profile once it's verified - the exact same "verified is
-- effectively directory-public" boundary public_directory already uses.
-- Unverified/pending profiles remain visible only to their own owner.
create policy "verified profiles are readable by any authenticated user" on profiles
  for select using (verification_status = 'verified');
