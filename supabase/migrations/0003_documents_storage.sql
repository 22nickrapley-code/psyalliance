-- Documents module: Storage bucket + path-convention RLS, and a broadened
-- read policy on the `documents` metadata table so "world" (shared-library)
-- rows are visible to any authenticated user, not just their owner.
--
-- Path convention inside the "documents" bucket:
--   personal/<uid>/<filename>   - owner-only, matches owner_scope = 'personal'
--   shared/<uid>/<filename>     - readable by any authenticated user,
--                                 writable only by the uploader, matches
--                                 owner_scope = 'world'

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "personal documents are owner-only"
on storage.objects for all
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'personal'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'personal'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "shared documents are readable by any authenticated user"
on storage.objects for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and auth.role() = 'authenticated'
);

create policy "shared documents are writable only by their uploader"
on storage.objects for insert
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and owner = auth.uid()
);

create policy "shared documents are only editable by their uploader"
on storage.objects for update
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and owner = auth.uid()
);

create policy "shared documents are only deletable by their uploader"
on storage.objects for delete
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and owner = auth.uid()
);

create policy "world documents are readable by any authenticated user" on documents
  for select using (owner_scope = 'world' and auth.role() = 'authenticated');
