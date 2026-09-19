-- Professional photo upload ("Psychology Today feel" on profiles), per
-- Nick's request. profiles.avatar_path stores the object path inside a new
-- private 'avatars' storage bucket (<uid>/avatar-<timestamp>.<ext>) - not a
-- public URL. The bucket stays non-public (matches the closed-network
-- posture from 0030's anon-exposure fix): only a signed URL, generated
-- server-side for a signed-in member, ever resolves it to a viewable image.

alter table profiles add column avatar_path text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Path convention: <uid>/<filename> - owner-only to write, matching the
-- documents bucket's folder-prefix-ownership pattern.
create policy "avatar photos are owner-only to insert"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar photos are owner-only to update"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar photos are owner-only to delete"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Readable by any signed-in colleague (this is the directory photo, meant
-- to be seen across Network/Referrals/Supervision listings) - never anon.
create policy "avatar photos are readable by any authenticated user"
on storage.objects for select
using (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
);

-- Recreate public_directory to carry avatar_path through to the listing
-- pages. Grants must be re-applied from scratch after a view replace -
-- authenticated only, matching the anon lockdown from 0030 (no anon grant
-- here, deliberately).
drop view public_directory;

create view public_directory
with (security_invoker = false) as
select
  p.id,
  p.full_name,
  p.credential_prefix,
  p.qualification_level,
  p.board_certified,
  p.primary_practice_city,
  p.primary_state,
  p.accepting_referrals,
  p.last_active_at,
  p.practice_website,
  p.contact_phone,
  p.contact_email,
  p.open_to_group_consultation,
  p.open_to_give_supervision,
  p.open_to_receive_supervision,
  p.psypact_participating,
  p.avatar_path,
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified';

-- A fresh CREATE VIEW in this project picks up Supabase's default
-- privileges (anon + authenticated both get a full grant automatically),
-- regardless of the GRANT below - that only adds, it doesn't remove what
-- the default just applied. Explicitly revoke from anon or this silently
-- reopens the exact anon-exposure hole 0030 closed.
revoke all on public_directory from anon;
grant select on public_directory to authenticated;
