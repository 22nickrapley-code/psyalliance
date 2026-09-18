-- Practice model: lets a profile flag whether they run their own private
-- practice, are employed by/contracted to a group practice or consultancy,
-- or both (locum/hybrid). Drives how the Caseload page is labeled and
-- (eventually) which extra tools are shown. Kept as two independent
-- booleans rather than an enum since "both" is a real, common case.
alter table public.profiles
  add column if not exists runs_private_practice boolean not null default false,
  add column if not exists employed_by_group_practice boolean not null default false;

-- Multi-select treatment areas for documents. Mirrors the
-- profile_lookup_values join-table pattern: a document can now be tagged
-- with several treatment areas instead of exactly one. The legacy
-- documents.treatment_area column is left in place (unused going forward)
-- rather than dropped, so existing single-value data isn't destroyed; it
-- can be backfilled into this table and dropped in a later migration.
create table if not exists public.document_treatment_areas (
  document_id bigint not null references public.documents (id) on delete cascade,
  lookup_value_id bigint not null references public.lookup_values (id),
  primary key (document_id, lookup_value_id)
);

create index if not exists document_treatment_areas_document_id_idx
  on public.document_treatment_areas (document_id);
create index if not exists document_treatment_areas_lookup_value_id_idx
  on public.document_treatment_areas (lookup_value_id);

alter table public.document_treatment_areas enable row level security;

-- Same ownership shape as "own documents only" on public.documents itself.
create policy "own document treatment areas only" on public.document_treatment_areas
  for all
  using (exists (
    select 1 from public.documents d
    where d.id = document_treatment_areas.document_id
      and d.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.documents d
    where d.id = document_treatment_areas.document_id
      and d.profile_id = (select auth.uid())
  ));

-- Same shape as "world documents are readable by any authenticated user" on
-- public.documents - lets any signed-in user see the treatment-area tags
-- for documents shared into the world/shared library.
create policy "world document treatment areas are readable by any authenticated user" on public.document_treatment_areas
  for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_treatment_areas.document_id
        and d.owner_scope = 'world'
    )
    and (select auth.role()) = 'authenticated'
  );

-- Backfill: convert existing single-value treatment_area strings into the
-- new join table so already-uploaded documents don't lose their tag.
insert into public.document_treatment_areas (document_id, lookup_value_id)
select d.id, lv.id
from public.documents d
join public.lookup_values lv
  on lv.category = 'treatment_specialism'
  and lv.value = d.treatment_area
where d.treatment_area is not null
on conflict do nothing;
