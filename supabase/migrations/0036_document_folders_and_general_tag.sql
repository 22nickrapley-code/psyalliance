-- Flat, per-user folders for organizing personal documents (Nick's Sept 20
-- feedback: drag-and-drop upload, a "General" catch-all treatment area tag,
-- and a folder system for personal documents). Deliberately flat (no
-- nesting) and one folder per document (not tag-style) - Nick's own choice
-- when asked.
create table if not exists document_folders (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (profile_id, name)
);

alter table document_folders enable row level security;

create policy "own folders only"
  on document_folders for all
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

alter table documents
  add column if not exists folder_id bigint references document_folders(id) on delete set null;

create index if not exists documents_folder_id_idx on documents(folder_id);

-- "General" catch-all: a document that isn't specific to any treatment
-- area. A boolean flag rather than a fake lookup_values row, since
-- treatment_specialism is shared with profile self-disclosure and the
-- matching engine - a synthetic "General" specialism there would leak into
-- places that have nothing to do with documents.
alter table documents
  add column if not exists is_general boolean not null default false;

-- Admins can delete any document. Previously only the uploader could
-- (RLS "own documents only" policy, FOR ALL, profile_id = auth.uid()),
-- which meant a shared-library document could never be taken down by an
-- admin even though the product calls for that. Additive/permissive
-- alongside the existing owner-only policy - RLS policies OR together.
create policy "admins can delete any document"
  on documents for delete
  using (is_admin_user((select auth.uid())));

-- Same for the underlying storage object - without this an admin's DB-row
-- delete would succeed but leave the file orphaned in the shared/ folder.
create policy "admins can delete any shared document file"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'shared'
    and is_admin_user((select auth.uid()))
  );
