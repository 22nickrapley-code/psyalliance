-- PsyA2 #98/#100/#101: account-status controls and content moderation
-- reporting, previously entirely unbuilt.
--
-- account_status is admin-set moderation state, separate from
-- verification_status: anything but 'active' hides the profile from
-- OTHER members (directory/matching/search, via the updated "verified
-- profiles are readable" policy below) but does not touch the member's
-- own sign-in or self-view. protect_admin_controlled_profile_columns()
-- (the existing trigger that already pins verification_status/verified_at
-- /is_admin against non-admin edits) is extended to also pin
-- account_status.
alter table profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'restricted', 'suspended', 'deactivated'));

comment on column profiles.account_status is
  'Admin-set moderation status (PsyA2 #100). Anything but active hides the profile from other members (directory/matching/search) - does not affect the member''s own sign-in or self-view.';

create or replace function public.protect_admin_controlled_profile_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not private.is_admin_user((select auth.uid())) then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.is_admin := old.is_admin;
    new.account_status := old.account_status;
  end if;
  return new;
end;
$function$;

drop policy if exists "verified profiles are readable by any authenticated user" on profiles;
create policy "verified profiles are readable by any authenticated user" on profiles
  for select using (
    verification_status = 'verified'
    and account_status = 'active'
    and (select auth.role()) = 'authenticated'
  );

-- Content moderation queue (PsyA2 #101). target_id is text rather than a
-- typed FK because targets span uuid (profile/user) and bigint
-- (consultation) primary keys across differently-shaped tables - resolved
-- app-side per target_type, not via a polymorphic foreign key.
create table if not exists reports (
  id bigint generated always as identity primary key,
  reporter_profile_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('consultation', 'message', 'profile', 'user', 'library_document')),
  target_id text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed', 'escalated')),
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  action_taken text,
  admin_notes text
);
create index if not exists idx_reports_status_created on reports (status, created_at desc);
alter table reports enable row level security;

create policy "members can file their own reports" on reports
  for insert with check (reporter_profile_id = (select auth.uid()));

create policy "members can see their own filed reports" on reports
  for select using (reporter_profile_id = (select auth.uid()));

create policy "admins can see and resolve all reports" on reports
  for all using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));
