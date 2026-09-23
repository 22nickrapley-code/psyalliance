-- public_directory was a plain (definer-privilege) view, flagged by the
-- security advisor because it bypasses the querying user's own RLS.
-- Switching it to security_invoker was blocked until the previous
-- migration fixed profile_lookup_values' missing SELECT policy - without
-- that fix, an invoker-mode public_directory would have gone right back
-- to returning nothing for anyone else's specialisms. Verified identical
-- row count (973) before and after this change.
alter view public.public_directory set (security_invoker = true);
