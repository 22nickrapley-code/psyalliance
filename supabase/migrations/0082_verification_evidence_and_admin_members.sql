-- Verification status must match the evidence. A clinician can be marked
-- verified only once at least one licence has been reviewed and is in
-- date. Operator (admin-only) logins can never be verified clinicians.
-- Demo accounts are exempt (their licences are demo data).

create or replace function public.guard_verification_evidence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    if new.account_kind = 'operator' then
      raise exception 'Admin-only accounts aren''t clinicians and can''t be verified.' using errcode = 'P0001';
    end if;
    if not new.is_demo and not public.has_active_licence(new.id) then
      raise exception 'Review at least one in-date licence before verifying this member.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_verification_evidence() from public, anon, authenticated;
drop trigger if exists guard_verification_evidence on public.profiles;
create trigger guard_verification_evidence before update of verification_status on public.profiles
  for each row execute function public.guard_verification_evidence();

-- One admin view of every account, with the evidence next to the status.
create or replace function public.admin_members()
returns table(
  id uuid, full_name text, credential_prefix text, qualification_level text,
  primary_state text, primary_practice_city text, verification_status text,
  account_status text, account_kind text, is_admin boolean, is_demo boolean, demo_view boolean,
  email text, contact_email text, npi_number text, created_at timestamptz, last_active_at timestamptz,
  reviewed_licences int, unreviewed_licences int, eligible boolean
)
language sql
stable security definer
set search_path to 'public'
as $$
  select p.id, p.full_name, p.credential_prefix, p.qualification_level::text,
         p.primary_state, p.primary_practice_city, p.verification_status::text,
         p.account_status, p.account_kind, p.is_admin, p.is_demo, p.demo_view,
         u.email::text, p.contact_email, p.npi_number, p.created_at, p.last_active_at,
         (select count(*) from licenses l where l.profile_id = p.id and l.reviewed_at is not null and l.status = 'active'
            and (l.expiration_date is null or l.expiration_date >= current_date))::int,
         (select count(*) from licenses l where l.profile_id = p.id and l.reviewed_at is null)::int,
         private.is_network_member(p.id)
  from profiles p
  left join auth.users u on u.id = p.id
  where private.is_admin_user(auth.uid());
$$;
revoke execute on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;
