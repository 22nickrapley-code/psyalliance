-- Document_FIling.txt: "Is there a way of rating the documents? So that
-- people can see what others have found to be best?" - a simple 1-5 star
-- rating, one per person per document, scoped to the shared/world library
-- only (rating your own personal documents isn't meaningful).
create table document_ratings (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id) on delete cascade,
  rated_by uuid not null references profiles (id) on delete cascade,
  rating smallint not null,
  created_at timestamptz not null default now(),
  constraint valid_rating check (rating between 1 and 5),
  unique (document_id, rated_by)
);

create index idx_document_ratings_document on document_ratings (document_id);

alter table document_ratings enable row level security;

create policy "ratings on world documents are readable by any authenticated user" on document_ratings
  for select using (
    exists (
      select 1 from documents d
      where d.id = document_id and (d.owner_scope = 'world' or d.profile_id = (select auth.uid()))
    )
  );

create policy "any authenticated user can rate a world document once" on document_ratings
  for insert with check (
    rated_by = (select auth.uid())
    and exists (select 1 from documents d where d.id = document_id and d.owner_scope = 'world')
  );

-- Deliberately split into UPDATE/DELETE (not a single "for all") - a "for
-- all" policy's WITH CHECK also governs INSERT, which would have let
-- anyone insert a rating on ANY document id (including someone else's
-- personal, non-world document they can't even see) as long as
-- rated_by = themselves, since the FK check on document_id bypasses RLS
-- and doesn't confirm the referenced document is actually world-scoped.
create policy "raters can update their own rating" on document_ratings
  for update using (rated_by = (select auth.uid())) with check (rated_by = (select auth.uid()));

create policy "raters can delete their own rating" on document_ratings
  for delete using (rated_by = (select auth.uid()));

grant select on document_ratings to authenticated;
