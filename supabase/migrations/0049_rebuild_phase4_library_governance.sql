-- Rebuild Phase 4, batch 5: Practice Library governance (Addendum A6).
-- Extends the existing `documents` table (Documents -> Practice Library +
-- My Library, per Master Brief #41-47) rather than replacing it - folders,
-- storage, treatment-area tagging, ratings all stay useful and untouched.
--
-- The hard rule from A6 is enforced with a real trigger, not just a
-- column: "A resource cannot move to Published until all required
-- reviewers for that resource type have approved that particular
-- version." A clinician's own credentials never substitute for this -
-- there's no shortcut in the trigger for "reviewer is also the author" or
-- similar.

alter table documents
  add column if not exists resource_owner_id uuid references profiles (id) on delete set null,
  add column if not exists version integer not null default 1,
  add column if not exists publish_date date,
  add column if not exists sources text,
  add column if not exists applicability text,
  add column if not exists customization_warning text,
  add column if not exists review_date date,
  add column if not exists next_review_date date,
  add column if not exists review_status text not null default 'draft'
    check (review_status in ('draft', 'in_review', 'published', 'needs_review')),
  -- e.g. {clinical, legal_regulatory, privacy_security, prescribing} - the
  -- specific role vocabulary is deliberately open text, not an enum, since
  -- Addendum A6 says the exact reviewer taxonomy is settled operationally,
  -- not architecturally.
  add column if not exists required_reviewer_roles text[] not null default '{}';

comment on column documents.review_status is
  'Addendum A6: draft is never member-visible. A resource can only reach published once every role in required_reviewer_roles has an approved review for this exact version - enforced by enforce_document_publish_requirements().';

create table document_reviews (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id) on delete cascade,
  document_version integer not null,
  reviewer_role text not null,
  reviewer_profile_id uuid not null references profiles (id) on delete cascade,
  approved boolean not null default false,
  notes text,
  reviewed_at timestamptz not null default now(),
  unique (document_id, document_version, reviewer_role)
);

create index idx_document_reviews_document on document_reviews (document_id, document_version);

create or replace function enforce_document_publish_requirements()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  missing_roles text[];
begin
  if new.review_status = 'published' and (old.review_status is distinct from 'published' or old.version is distinct from new.version) then
    select array_agg(role) into missing_roles
    from unnest(new.required_reviewer_roles) as role
    where not exists (
      select 1 from document_reviews dr
      where dr.document_id = new.id
        and dr.document_version = new.version
        and dr.reviewer_role = role
        and dr.approved = true
    );
    if missing_roles is not null and array_length(missing_roles, 1) > 0 then
      raise exception 'Cannot publish "%": missing approval from required reviewer role(s): %', new.title, array_to_string(missing_roles, ', ');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_document_publish
  before update on documents
  for each row execute function enforce_document_publish_requirements();

alter table document_reviews enable row level security;

create policy "document reviews are readable network-wide" on document_reviews
  for select using ((select auth.uid()) is not null);

create policy "a reviewer records their own review" on document_reviews
  for insert with check ((select auth.uid()) = reviewer_profile_id);

create policy "a reviewer updates their own review" on document_reviews
  for update using ((select auth.uid()) = reviewer_profile_id) with check ((select auth.uid()) = reviewer_profile_id);
