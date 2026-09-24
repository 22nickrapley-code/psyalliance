-- Preserve the legacy branch before applying this migration. The current
-- directory contains 60 @seed.psyalliance.test accounts and one real profile
-- marked verified without a reviewed credential. Neither is evidence of a
-- verified clinician network. Do not delete fixtures or member records.
-- Migration sessions have no auth.uid(); the existing owner-write clamp would
-- silently discard these administrator data corrections. Restore it before
-- installing the new credential trigger.
alter table public.profiles disable trigger clamp_admin_controlled_profile_columns;
update public.profiles p
set account_status = 'restricted'
from auth.users u
where u.id = p.id and u.email like '%@seed.psyalliance.test';

update public.profiles p
set verification_status = 'pending', verified_at = null
where p.verification_status = 'verified'
  and not exists (
    select 1 from public.credential_verifications cv
    where cv.profile_id = p.id
      and cv.source in ('state_board', 'asppb')
      and cv.matched = true
      and cv.reviewed_by is not null and cv.reviewed_by <> cv.profile_id
      and cv.reviewed_at is not null
  );
alter table public.profiles enable trigger clamp_admin_controlled_profile_columns;

-- A member-entered licence or an NPI pre-check is never a human-reviewed
-- professional credential. Protect all future transitions, including admin
-- direct REST writes, at the database boundary.
create or replace function private.require_reviewed_professional_credential()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if new.verification_status = 'verified'
     and old.verification_status is distinct from 'verified'
     and not exists (
       select 1 from public.credential_verifications cv
       where cv.profile_id = new.id
         and cv.source in ('state_board', 'asppb')
         and cv.matched = true
         and cv.reviewed_by is not null and cv.reviewed_by <> cv.profile_id
         and cv.reviewed_at is not null
     ) then
    raise exception 'A reviewed state-board or ASPPB credential is required before verification';
  end if;
  return new;
end;
$$;
revoke execute on function private.require_reviewed_professional_credential() from public, anon, authenticated;
drop trigger if exists require_reviewed_professional_credential on public.profiles;
create trigger require_reviewed_professional_credential
  before update of verification_status on public.profiles
  for each row execute function private.require_reviewed_professional_credential();

-- The original view counted one row per specialism; the application must
-- COUNT(DISTINCT id) for audience reach. Restrict visibility to active
-- verified members. Seed accounts remain stored for controlled fixtures.
create or replace view public.public_directory
with (security_invoker = true) as
select
  p.id, p.full_name, p.credential_prefix, p.qualification_level,
  p.board_certified, p.primary_practice_city, p.primary_state,
  p.accepting_referrals, p.referral_availability, p.coverage_availability,
  p.consultation_availability, p.availability_confirmed_at, p.last_active_at,
  p.practice_website, p.contact_phone, p.contact_email,
  p.open_to_group_consultation, p.open_to_give_supervision,
  p.open_to_receive_supervision, p.psypact_participating, p.avatar_path,
  lv.category, lv.value, plv.rank
from public.profiles p
join public.profile_lookup_values plv on plv.profile_id = p.id
join public.lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified' and p.account_status = 'active';
revoke all on public.public_directory from anon;
grant select on public.public_directory to authenticated;

create or replace function public.verified_network_audience_count()
returns bigint language sql stable security invoker
set search_path = '' as $$
  select count(distinct id) from public.public_directory
  where id <> (select auth.uid());
$$;
revoke execute on function public.verified_network_audience_count() from public, anon;
grant execute on function public.verified_network_audience_count() to authenticated;

-- Reviewer qualification is a separate, documented admin decision. A
-- document owner cannot review their own version. Existing approvals remain
-- in the audit trail, but self approvals cannot satisfy publication.
create table public.document_reviewer_authorizations (
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('clinical','legal_regulatory','privacy_security','prescribing')),
  qualification_evidence text not null check (length(trim(qualification_evidence)) >= 20),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  primary key (reviewer_profile_id, reviewer_role)
);
alter table public.document_reviewer_authorizations enable row level security;
grant select, insert, update, delete on public.document_reviewer_authorizations to authenticated;
create policy "reviewer or admin reads authorizations" on public.document_reviewer_authorizations
  for select to authenticated
  using (reviewer_profile_id = (select auth.uid()) or private.is_admin_user((select auth.uid())));
create policy "admin manages reviewer authorizations" on public.document_reviewer_authorizations
  for all to authenticated
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())) and approved_by = (select auth.uid()));

-- Keep earlier reviews as an audit trail while permitting a newly qualified
-- independent reviewer to submit their own decision for the same role.
alter table public.document_reviews
  drop constraint if exists document_reviews_document_id_document_version_reviewer_role_key;
alter table public.document_reviews
  add constraint document_reviews_reviewer_version_role_key
  unique (document_id, document_version, reviewer_role, reviewer_profile_id);

drop policy if exists "a reviewer records their own review" on public.document_reviews;
drop policy if exists "a reviewer updates their own review" on public.document_reviews;
drop policy if exists "document reviews are readable network-wide" on public.document_reviews;
create policy "reviewer or admin reads reviews" on public.document_reviews
  for select to authenticated
  using (reviewer_profile_id = (select auth.uid()) or private.is_admin_user((select auth.uid())));
create policy "qualified reviewer records own review" on public.document_reviews
  for insert to authenticated with check (
    reviewer_profile_id = (select auth.uid())
    and exists (
      select 1 from public.document_reviewer_authorizations a
      where a.reviewer_profile_id = (select auth.uid()) and a.reviewer_role = document_reviews.reviewer_role
    )
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_scope = 'world'
        and d.version = document_version
        and d.resource_owner_id is distinct from (select auth.uid())
        and d.uploaded_by is distinct from (select auth.uid())
    )
  );
create policy "qualified reviewer updates own review" on public.document_reviews
  for update to authenticated
  using (reviewer_profile_id = (select auth.uid()))
  with check (
    reviewer_profile_id = (select auth.uid())
    and exists (
      select 1 from public.document_reviewer_authorizations a
      where a.reviewer_profile_id = (select auth.uid()) and a.reviewer_role = document_reviews.reviewer_role
    )
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_scope = 'world'
        and d.version = document_version
        and d.resource_owner_id is distinct from (select auth.uid())
        and d.uploaded_by is distinct from (select auth.uid())
    )
  );

create or replace function public.enforce_document_publish_requirements()
returns trigger language plpgsql security definer set search_path = '' as $$
declare missing_roles text[];
begin
  if new.owner_scope = 'world' and new.review_status = 'published'
     then
    if coalesce(array_length(new.required_reviewer_roles, 1), 0) = 0
       or new.resource_owner_id is null or new.sources is null
       or nullif(btrim(new.sources), '') is null
       or nullif(btrim(new.applicability), '') is null
       or nullif(btrim(new.customization_warning), '') is null
       or new.next_review_date is null or new.next_review_date < current_date then
      raise exception 'Shared resources need an owner, sources, applicability, caution, next review date and required reviewers';
    end if;
    select array_agg(role) into missing_roles
    from unnest(new.required_reviewer_roles) as role
    where not exists (
      select 1 from public.document_reviews dr
      join public.document_reviewer_authorizations a
        on a.reviewer_profile_id = dr.reviewer_profile_id and a.reviewer_role = dr.reviewer_role
      where dr.document_id = new.id and dr.document_version = new.version
        and dr.reviewer_role = role and dr.approved = true
        and dr.reviewer_profile_id is distinct from new.resource_owner_id
        and dr.reviewer_profile_id is distinct from new.uploaded_by
    );
    if missing_roles is not null then
      raise exception 'Cannot publish "%": qualified independent approval needed for %', new.title, array_to_string(missing_roles, ', ');
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_document_publish_requirements() from public, anon, authenticated;
create trigger trg_enforce_document_publish_on_insert
  before insert on public.documents for each row
  execute function public.enforce_document_publish_requirements();

-- The 20 existing PA PDFs were approved by their own resource owner for
-- every required role, and have no next-review date. Return them to the
-- admin queue pending independently documented subject-matter review.
update public.documents d set review_status = 'needs_review'
where d.owner_scope = 'world' and d.review_status = 'published'
  and (d.next_review_date is null or exists (
    select 1 from public.document_reviews dr
    where dr.document_id = d.id and dr.approved = true
      and (dr.reviewer_profile_id = d.resource_owner_id or dr.reviewer_profile_id = d.uploaded_by)
  ));

-- My Library can save reviewed resources without accepting patient files.
create table public.saved_library_resources (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  document_id bigint not null references public.documents(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (profile_id, document_id)
);
alter table public.saved_library_resources enable row level security;
grant select, insert, delete on public.saved_library_resources to authenticated;
create policy "member sees own saved resources" on public.saved_library_resources
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "member saves reviewed resources" on public.saved_library_resources
  for insert to authenticated with check (
    profile_id = (select auth.uid()) and exists (
      select 1 from public.documents d where d.id = document_id
        and d.owner_scope = 'world' and d.review_status = 'published'
      and d.next_review_date >= current_date
    )
  );
create policy "member removes own saved resources" on public.saved_library_resources
  for delete to authenticated using (profile_id = (select auth.uid()));

-- Legacy caseload records remain owner-readable for a controlled export and
-- retention decision, but direct REST writes can no longer add patient data.
revoke insert, update, delete on public.caseload_clients from authenticated;

-- Direct PostgREST and Storage calls must observe the same publication and
-- upload boundary as the UI. A signed URL for an old resource expires in 60s.
drop policy if exists "own documents only" on public.documents;
drop policy if exists "world documents are readable by any authenticated user" on public.documents;
create policy "owner can read own legacy files" on public.documents
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "network reads published resources" on public.documents
  for select to authenticated using (owner_scope = 'world' and review_status = 'published'
    and next_review_date >= current_date);
create policy "admins read all library resources" on public.documents
  for select to authenticated using (private.is_admin_user((select auth.uid())));
create policy "admins upload shared resources" on public.documents
  for insert to authenticated with check (
    private.is_admin_user((select auth.uid())) and owner_scope = 'world'
    and profile_id = (select auth.uid()) and uploaded_by = (select auth.uid())
  );
create policy "admins manage shared resources" on public.documents
  for update to authenticated
  using (private.is_admin_user((select auth.uid())) and owner_scope = 'world')
  with check (private.is_admin_user((select auth.uid())) and owner_scope = 'world');
create policy "owner can remove own legacy files" on public.documents
  for delete to authenticated using (owner_scope = 'personal' and profile_id = (select auth.uid()));

drop policy if exists "personal documents are owner-only" on storage.objects;
create policy "owner reads own personal files" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'personal'
    and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "owner removes own personal files" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'personal'
    and (storage.foldername(name))[2] = (select auth.uid())::text);
drop policy if exists "shared documents are readable by any authenticated user" on storage.objects;
create policy "read only published shared files" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'shared'
    and (private.is_admin_user((select auth.uid())) or exists (
      select 1 from public.documents d where d.storage_path = storage.objects.name
        and d.owner_scope = 'world' and d.review_status = 'published'
      and d.next_review_date >= current_date
    )));
drop policy if exists "shared documents are writable only by their uploader" on storage.objects;
create policy "admins upload shared files" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'shared'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_admin_user((select auth.uid())));
drop policy if exists "shared documents are only editable by their uploader" on storage.objects;
create policy "admins edit shared files" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'shared'
    and private.is_admin_user((select auth.uid())))
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'shared'
    and private.is_admin_user((select auth.uid())));

-- Close the earlier authenticated-wide referral read path for new applicants
-- and restricted fixtures. A request owner still sees their own request.
drop policy if exists "referral requests are visible per their chosen audience" on public.referral_requests;
create policy "verified recipient sees chosen referral audience" on public.referral_requests
  for select to authenticated using (
    requesting_profile_id = (select auth.uid()) or
    (status in ('open', 'sent', 'connected', 'handoff') and exists (
      select 1 from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.verification_status = 'verified' and viewer.account_status = 'active'
    ) and (
      audience_type in ('wider_network', 'suggested')
      or (audience_type = 'selected' and (select auth.uid()) = any(audience_profile_ids))
      or (audience_type = 'trusted' and exists (
        select 1 from public.connections c where c.tier = 'trusted_colleague'
          and c.status = 'accepted' and
          ((c.requester_id = requesting_profile_id and c.addressee_id = (select auth.uid()))
           or (c.addressee_id = requesting_profile_id and c.requester_id = (select auth.uid())))
      ))
    ))
  );

-- No patient-linked assignment may be created through stale client code.
revoke insert, update, delete on public.referral_assignments from authenticated;

-- Authorized reviewers need to read unpublished versions and their files.
create policy "assigned reviewers read draft resources" on public.documents
  for select to authenticated using (
    owner_scope = 'world' and review_status in ('needs_review', 'in_review')
    and uploaded_by is distinct from (select auth.uid())
    and resource_owner_id is distinct from (select auth.uid())
    and exists (
      select 1 from public.document_reviewer_authorizations a
      where a.reviewer_profile_id = (select auth.uid())
        and a.reviewer_role = any(required_reviewer_roles)
    )
  );
drop policy if exists "read only published shared files" on storage.objects;
create policy "read published or assigned shared files" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'shared'
    and (private.is_admin_user((select auth.uid())) or exists (
      select 1 from public.documents d where d.storage_path = storage.objects.name
        and d.owner_scope = 'world' and
        ((d.review_status = 'published' and d.next_review_date >= current_date) or (d.review_status in ('needs_review', 'in_review')
          and d.uploaded_by is distinct from (select auth.uid())
          and d.resource_owner_id is distinct from (select auth.uid())
          and exists (select 1 from public.document_reviewer_authorizations a
            where a.reviewer_profile_id = (select auth.uid())
              and a.reviewer_role = any(d.required_reviewer_roles))))
    )));

-- Rejection or lost qualification removes a published version from circulation.
-- The affected review stays in the audit trail.
create or replace function private.return_resource_to_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'document_reviews' then
    if new.approved = false then
      update public.documents d set review_status = 'needs_review'
      where d.id = new.document_id and d.version = new.document_version
        and d.review_status = 'published';
    end if;
  else
    update public.documents d set review_status = 'needs_review'
    where d.review_status = 'published'
      and old.reviewer_role = any(d.required_reviewer_roles)
      and exists (select 1 from public.document_reviews dr
        where dr.document_id = d.id and dr.document_version = d.version
          and dr.reviewer_profile_id = old.reviewer_profile_id
          and dr.reviewer_role = old.reviewer_role and dr.approved = true)
      and not exists (select 1 from public.document_reviews dr
        join public.document_reviewer_authorizations a
          on a.reviewer_profile_id = dr.reviewer_profile_id
         and a.reviewer_role = dr.reviewer_role
        where dr.document_id = d.id and dr.document_version = d.version
          and dr.reviewer_role = old.reviewer_role and dr.approved = true
          and dr.reviewer_profile_id is distinct from d.resource_owner_id
          and dr.reviewer_profile_id is distinct from d.uploaded_by);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function private.return_resource_to_review() from public, anon, authenticated;
create trigger resource_review_rejection after insert or update of approved on public.document_reviews
  for each row execute function private.return_resource_to_review();
create trigger reviewer_authorization_revoked after delete on public.document_reviewer_authorizations
  for each row execute function private.return_resource_to_review();

-- The author must still see a selected consultation to track replies. Other
-- recipients must belong to the reviewed, active network.
drop policy if exists "consultations are visible per their chosen audience" on public.consultations;
create policy "author or verified chosen audience sees consultation" on public.consultations
  for select to authenticated using (
    author_profile_id = (select auth.uid()) or
    (status not in ('draft', 'removed') and exists (
      select 1 from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.verification_status = 'verified' and viewer.account_status = 'active'
    ) and (
      audience_type = 'wider_network'
      or (audience_type = 'selected' and (select auth.uid()) = any(audience_profile_ids))
      or (audience_type = 'trusted' and exists (
        select 1 from public.connections c where c.tier = 'trusted_colleague'
          and c.status = 'accepted'
          and ((c.requester_id = author_profile_id and c.addressee_id = (select auth.uid()))
            or (c.addressee_id = author_profile_id and c.requester_id = (select auth.uid())))
      ))
      or (group_id is not null and private.is_consultation_group_member(group_id, (select auth.uid())))
    ))
  );

-- A pending or restricted account may view its own older requests for export
-- and closure, but only a reviewed active member may publish a new one.
drop policy if exists "create your own referral requests" on public.referral_requests;
create policy "verified member creates referral requests" on public.referral_requests
  for insert to authenticated with check (
    requesting_profile_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.verification_status = 'verified' and p.account_status = 'active')
  );
drop policy if exists "author manages their own consultations" on public.consultations;
create policy "verified author creates consultations" on public.consultations
  for insert to authenticated with check (
    author_profile_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.verification_status = 'verified' and p.account_status = 'active')
  );
create policy "author updates consultation" on public.consultations
  for update to authenticated using (author_profile_id = (select auth.uid()))
  with check (author_profile_id = (select auth.uid()));
create policy "author removes consultation" on public.consultations
  for delete to authenticated using (author_profile_id = (select auth.uid()));

-- Submission fields cannot be forged to look like completed board review.
create policy "applicant cannot self certify credential review" on public.credential_verifications
  as restrictive for insert to authenticated with check (
    reviewed_by is null and reviewed_at is null
    and (source = 'npi_registry' or matched = false)
  );

-- Preserve both sides of an accepted older Bench relationship as private
-- saves before retiring its dedicated member-facing list. No trust upgrade.
insert into public.saved_clinicians (profile_id, clinician_id)
select requester_id, addressee_id from public.connections
where status = 'accepted' and tier = 'bench'
on conflict (profile_id, clinician_id) do nothing;
insert into public.saved_clinicians (profile_id, clinician_id)
select addressee_id, requester_id from public.connections
where status = 'accepted' and tier = 'bench'
on conflict (profile_id, clinician_id) do nothing;

-- A restricted fixture or pending applicant cannot use an old browser tab
-- or call PostgREST directly to create network conversations or coverage.
-- Match the service jurisdiction of a case, never an assumed jurisdiction
-- based on the plan owner's licences. Historical cases can be audited and
-- supplied with a state; new cases must explicitly provide one.
alter table public.coverage_plan_cases add column if not exists service_state text;
alter table public.coverage_plan_cases add constraint coverage_case_service_state_format
  check (service_state is null or service_state ~ '^[A-Z]{2}$');
create policy "new coverage cases identify state of service" on public.coverage_plan_cases
  as restrictive for insert to authenticated with check (service_state is not null);

create or replace function private.is_active_verified_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.verification_status = 'verified'
      and p.account_status = 'active');
$$;
revoke execute on function private.is_active_verified_member() from public, anon;
grant execute on function private.is_active_verified_member() to authenticated;
create policy "verified member creates coverage plans" on public.coverage_plans
  as restrictive for insert to authenticated with check (private.is_active_verified_member());
create policy "coverage plan type has required context" on public.coverage_plans
  as restrictive for insert to authenticated with check (
    (plan_type <> 'extended_leave' or
      (track is not null and starts_on is not null and ends_on is not null))
    and (plan_type <> 'reciprocal' or
      (reciprocal_partner_profile_id is not null and reciprocal_partner_profile_id <> (select auth.uid())
        and exists (select 1 from public.profiles partner
          where partner.id = reciprocal_partner_profile_id and partner.verification_status = 'verified'
            and partner.account_status = 'active')
        and exists (select 1 from public.connections c
          where c.status = 'accepted' and c.tier = 'trusted_colleague'
            and ((c.requester_id = (select auth.uid()) and c.addressee_id = reciprocal_partner_profile_id)
              or (c.addressee_id = (select auth.uid()) and c.requester_id = reciprocal_partner_profile_id)))))
  );
create policy "verified member creates coverage cases" on public.coverage_plan_cases
  as restrictive for insert to authenticated with check (private.is_active_verified_member());
create policy "verified member creates coverage outreach" on public.coverage_requests
  as restrictive for insert to authenticated with check (private.is_active_verified_member());
create policy "coverage outreach starts with a verified recipient" on public.coverage_requests
  as restrictive for insert to authenticated with check (
    status = 'sent' and responded_at is null
    and requested_profile_id <> (select auth.uid())
    and exists (select 1 from public.profiles recipient
      where recipient.id = requested_profile_id
        and recipient.verification_status = 'verified'
        and recipient.account_status = 'active')
  );
create policy "verified member creates connections" on public.connections
  as restrictive for insert to authenticated with check (private.is_active_verified_member());
create policy "verified member opens conversations" on public.conversations
  as restrictive for insert to authenticated with check (private.is_active_verified_member());
create policy "verified member sends messages" on public.conversation_messages
  as restrictive for insert to authenticated with check (private.is_active_verified_member());

-- A recipient's direct update to coverage_requests could succeed while the
-- following application update to the owner's coverage_plan_cases row was
-- denied by RLS. Respond and transition the case in one transaction. Only
-- the addressed verified clinician can move a sent request, and an accepted
-- case expires other outstanding invitations before they can be accepted.
create or replace function public.respond_to_coverage_request(
  p_request_id bigint, p_response public.coverage_request_status
)
returns table(owner_profile_id uuid, coverage_case_id bigint, initial_sent_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_case bigint;
  v_recipient uuid;
  v_status public.coverage_request_status;
  v_case_status public.coverage_case_status;
  v_sent timestamptz;
begin
  if p_response not in ('accepted', 'declined', 'discussing') then
    raise exception 'Choose a valid coverage response';
  end if;
  if not private.is_active_verified_member() then
    raise exception 'A verified active account is required';
  end if;

  select p.profile_id, c.id, r.requested_profile_id, r.status, c.status, r.sent_at
    into v_owner, v_case, v_recipient, v_status, v_case_status, v_sent
  from public.coverage_requests r
  join public.coverage_plan_cases c on c.id = r.coverage_plan_case_id
  join public.coverage_plans p on p.id = c.coverage_plan_id
  where r.id = p_request_id
  for update of r, c;

  if v_case is null or v_recipient is distinct from auth.uid() then
    raise exception 'Coverage request not found';
  end if;
  if v_status not in ('sent', 'discussing') or v_case_status <> 'awaiting_response'
     or (v_status = 'discussing' and p_response = 'discussing') then
    raise exception 'This coverage request is no longer awaiting a response';
  end if;

  update public.coverage_requests
    set status = p_response, responded_at = now()
    where id = p_request_id;

  if p_response = 'accepted' then
    update public.coverage_plan_cases
      set status = 'confirmed', assigned_clinician_id = v_recipient
      where id = v_case;
    update public.coverage_requests
      set status = 'expired'
      where coverage_plan_case_id = v_case and id <> p_request_id and status in ('sent', 'discussing');
  elsif p_response = 'declined' and not exists (
    select 1 from public.coverage_requests
    where coverage_plan_case_id = v_case and status in ('sent', 'discussing')
  ) then
    update public.coverage_plan_cases
      set status = 'needs_cover', assigned_clinician_id = null
      where id = v_case;
  end if;

  return query select v_owner, v_case, v_sent;
end;
$$;
revoke all on function public.respond_to_coverage_request(bigint, public.coverage_request_status) from public, anon;
grant execute on function public.respond_to_coverage_request(bigint, public.coverage_request_status) to authenticated;
-- The old broad RLS update policy must not provide a direct REST bypass.
revoke update on public.coverage_requests from authenticated;

-- A member could previously insert a rejection for somebody else's case by
-- supplying their own profile_id, poisoning its exclusion list. Both the
-- read and the write must be tied to ownership of the underlying plan.
drop policy if exists "coverage_case_rejections_insert_own" on public.coverage_case_rejections;
drop policy if exists "coverage_case_rejections_select_own" on public.coverage_case_rejections;
drop policy if exists "coverage_case_rejections_delete_own" on public.coverage_case_rejections;
create policy "coverage_case_rejections_select_own" on public.coverage_case_rejections
  for select to authenticated using (
    profile_id = (select auth.uid()) and exists (
      select 1 from public.coverage_plan_cases c
      join public.coverage_plans p on p.id = c.coverage_plan_id
      where c.id = coverage_plan_case_id and p.profile_id = (select auth.uid())
    )
  );
create policy "coverage_case_rejections_insert_own" on public.coverage_case_rejections
  for insert to authenticated with check (
    profile_id = (select auth.uid()) and exists (
      select 1 from public.coverage_plan_cases c
      join public.coverage_plans p on p.id = c.coverage_plan_id
      where c.id = coverage_plan_case_id and p.profile_id = (select auth.uid())
    )
  );
create policy "coverage_case_rejections_delete_own" on public.coverage_case_rejections
  for delete to authenticated using (
    profile_id = (select auth.uid()) and exists (
      select 1 from public.coverage_plan_cases c
      join public.coverage_plans p on p.id = c.coverage_plan_id
      where c.id = coverage_plan_case_id and p.profile_id = (select auth.uid())
    )
  );

-- A case cannot be presented as confirmed without an actual accepted
-- invitation to the clinician assigned to it. An awaiting case likewise
-- needs at least one active invitation.
create or replace function private.guard_coverage_case_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and not exists (
    select 1 from public.coverage_requests r
    where r.coverage_plan_case_id = new.id and r.status = 'accepted'
      and r.requested_profile_id = new.assigned_clinician_id
  ) then
    raise exception 'Confirmed cover requires an accepted clinician request';
  end if;
  if new.status = 'awaiting_response' and not exists (
    select 1 from public.coverage_requests r
    where r.coverage_plan_case_id = new.id and r.status in ('sent', 'discussing')
  ) then
    raise exception 'Awaiting response requires an active clinician request';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_coverage_case_claim() from public, anon, authenticated;
create trigger guard_coverage_case_claim
  before insert or update on public.coverage_plan_cases
  for each row execute function private.guard_coverage_case_claim();
