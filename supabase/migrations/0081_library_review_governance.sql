-- Practice Library governance that holds up to scrutiny.
--
-- Before this, one account recorded every approval for every role on all
-- 20 resources, and nothing stopped it. Now:
--   * Reviewers are appointed by an admin to a role, with the credential
--     that qualifies them. Clinical reviewers must be eligible network
--     clinicians; prescribing reviewers must be eligible MDs or DOs;
--     legal and privacy reviewers need a stated qualification.
--   * A review counts only if the reviewer holds an active appointment for
--     that role, reviews the current version, didn't write or own the
--     resource, and hasn't already approved the same version in another
--     role. One person, one role, per version.
--   * Changing a published resource's content (file, title, summary,
--     applicability, warning) creates a new version that needs review again.
--   * The existing approvals are kept for the record but invalidated, and
--     the 20 resources become "provisional": visible, clearly labelled as
--     not yet independently reviewed.

create table if not exists public.library_reviewers (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('clinical', 'legal_regulatory', 'privacy_security', 'prescribing')),
  qualification text not null check (length(trim(qualification)) >= 5),
  appointed_by uuid references public.profiles(id),
  appointed_at timestamptz not null default now(),
  active boolean not null default true,
  unique (profile_id, role)
);
create index if not exists library_reviewers_appointed_by_idx on public.library_reviewers(appointed_by);
alter table public.library_reviewers enable row level security;

drop policy if exists "admins manage reviewer appointments" on public.library_reviewers;
create policy "admins manage reviewer appointments" on public.library_reviewers
  for all to authenticated
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));
drop policy if exists "members see who reviews the library" on public.library_reviewers;
create policy "members see who reviews the library" on public.library_reviewers
  for select to authenticated
  using ((select auth.uid()) is not null);

create or replace function public.guard_library_reviewer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare p record;
begin
  select * into p from profiles where id = new.profile_id;
  if auth.uid() is not null then
    new.appointed_by := auth.uid();
    if new.appointed_by = new.profile_id then
      raise exception 'An admin can''t appoint themselves as a reviewer. Ask another admin.' using errcode = 'P0001';
    end if;
  end if;
  if p.is_demo and not private.profile_is_demo(auth.uid()) then
    raise exception 'Demo accounts can''t review real resources.' using errcode = 'P0001';
  end if;
  if new.role = 'clinical' and not private.is_network_member(new.profile_id) then
    raise exception 'Clinical reviewers must be verified clinicians with a reviewed licence.' using errcode = 'P0001';
  end if;
  if new.role = 'prescribing' and not (private.is_network_member(new.profile_id) and p.qualification_level::text in ('MD', 'DO')) then
    raise exception 'Prescribing reviewers must be verified psychiatrists (MD or DO) with a reviewed licence.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_library_reviewer() from public, anon, authenticated;
drop trigger if exists guard_library_reviewer on public.library_reviewers;
create trigger guard_library_reviewer before insert or update on public.library_reviewers
  for each row execute function public.guard_library_reviewer();

-- Reviews: keep history, allow a fresh review after an invalidated one.
alter table public.document_reviews add column if not exists invalidated_at timestamptz;
alter table public.document_reviews add column if not exists invalidated_reason text;
alter table public.document_reviews drop constraint if exists document_reviews_document_id_document_version_reviewer_role_key;
create unique index if not exists document_reviews_current_role_idx
  on public.document_reviews (document_id, document_version, reviewer_role)
  where invalidated_at is null;

create or replace function public.guard_document_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare d record;
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.invalidated_at is not null then
    raise exception 'That review was withdrawn. Record a new one.' using errcode = 'P0001';
  end if;
  select * into d from documents where id = new.document_id;
  if d.id is null or d.owner_scope <> 'world' then
    raise exception 'Only Practice Library resources are reviewed.' using errcode = 'P0001';
  end if;
  if new.document_version <> d.version then
    raise exception 'Review the current version (v%).', d.version using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from library_reviewers r
    where r.profile_id = new.reviewer_profile_id and r.role = new.reviewer_role and r.active
  ) then
    raise exception 'You aren''t appointed as a % reviewer.', replace(new.reviewer_role, '_', ' ') using errcode = 'P0001';
  end if;
  if new.reviewer_profile_id in (d.uploaded_by, d.resource_owner_id, d.profile_id) then
    raise exception 'Reviews must be independent: you wrote or own this resource.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from document_reviews o
    where o.document_id = new.document_id and o.document_version = new.document_version
      and o.reviewer_profile_id = new.reviewer_profile_id and o.reviewer_role <> new.reviewer_role
      and o.invalidated_at is null and o.id is distinct from new.id
  ) then
    raise exception 'You''ve already reviewed this version in another role. Each role needs a different reviewer.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_document_review() from public, anon, authenticated;
drop trigger if exists guard_document_review on public.document_reviews;
create trigger guard_document_review before insert or update on public.document_reviews
  for each row execute function public.guard_document_review();

-- Statuses: provisional = visible to members, labelled as not yet
-- independently reviewed.
alter table public.documents drop constraint if exists documents_review_status_check;
alter table public.documents add constraint documents_review_status_check
  check (review_status = any (array['draft', 'in_review', 'published', 'needs_review', 'provisional']));

create or replace function public.enforce_document_publish_requirements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  missing_roles text[];
  content_changed boolean;
begin
  content_changed := tg_op = 'UPDATE' and (
    new.storage_path is distinct from old.storage_path
    or new.title is distinct from old.title
    or new.summary is distinct from old.summary
    or new.applicability is distinct from old.applicability
    or new.customization_warning is distinct from old.customization_warning
  );
  -- Editing reviewed content makes a new version that needs review again.
  if content_changed and old.review_status in ('published', 'provisional') and new.version = old.version then
    new.version := old.version + 1;
    if old.review_status = 'published' then
      new.review_status := 'in_review';
      new.review_date := null;
    end if;
  end if;

  if new.review_status = 'published' and (tg_op = 'INSERT' or old.review_status is distinct from 'published' or old.version is distinct from new.version) then
    if coalesce(array_length(new.required_reviewer_roles, 1), 0) = 0 then
      raise exception 'Cannot publish "%": set the reviewer roles it needs first.', new.title using errcode = 'P0001';
    end if;
    select array_agg(role) into missing_roles
    from unnest(new.required_reviewer_roles) as role
    where not exists (
      select 1 from document_reviews dr
      join library_reviewers lr on lr.profile_id = dr.reviewer_profile_id and lr.role = dr.reviewer_role and lr.active
      where dr.document_id = new.id
        and dr.document_version = new.version
        and dr.reviewer_role = role
        and dr.approved = true
        and dr.invalidated_at is null
    );
    if missing_roles is not null and array_length(missing_roles, 1) > 0 then
      raise exception 'Cannot publish "%": needs an independent approval from: %', new.title, replace(array_to_string(missing_roles, ', '), '_', ' ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- The existing approvals: one operator account, every role. Keep them for
-- the audit trail, but they no longer count.
update public.document_reviews
set invalidated_at = now(),
    invalidated_reason = 'Recorded by a single operator account for every role. Not an independent review.'
where invalidated_at is null
  and reviewer_profile_id in (select id from public.profiles where account_kind = 'operator' or is_admin);

update public.documents
set review_status = 'provisional', review_date = null
where owner_scope = 'world' and review_status = 'published'
  and not exists (
    select 1 from public.document_reviews dr
    where dr.document_id = documents.id and dr.document_version = documents.version
      and dr.approved and dr.invalidated_at is null
  );

-- Members see who reviewed what (names and roles only), for the current version.
drop policy if exists "document reviews are readable network-wide" on public.document_reviews;
create policy "document reviews are readable by signed-in members" on public.document_reviews
  for select to authenticated
  using ((select auth.uid()) is not null);

-- Inserting a resource as already published used to skip the check.
drop trigger if exists trg_enforce_document_publish on public.documents;
create trigger trg_enforce_document_publish before insert or update on public.documents
  for each row execute function public.enforce_document_publish_requirements();
