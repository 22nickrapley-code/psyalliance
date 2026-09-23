-- Real bug, not a lint finding: profile_lookup_values had RLS enabled
-- with zero SELECT policies visible to anyone but the row's own owner
-- ("own profile lookup values only", for = auth.uid() = profile_id).
-- That silently broke every specialism-scoped query joining through this
-- table for someone ELSE's profile - Coverage/Referrals matching, and
-- specialty tag display on profile pages, Network, Messages, and Town
-- Hall all returned nothing for other members' specialisms. Found while
-- investigating the public_directory SECURITY DEFINER advisor finding
-- (see the next migration) - public_directory only worked as a plain view
-- because it bypassed this hole via its creator's privileges.
create policy "profile lookup values are readable for your own or verified profiles"
  on profile_lookup_values
  for select using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = profile_lookup_values.profile_id and p.verification_status = 'verified'
    )
  );
