-- M-extra: profile extensions from the "Considerations" and "Search" sheets -
-- notification preferences, an assigned emergency-cover contact, and a
-- per-user "do not work with" blocklist that removes someone from that
-- user's own predictive search/recommendation results (not a platform-wide
-- ban - purely a personal filter, mirroring the spec note verbatim).

create table notification_preferences (
  profile_id uuid primary key references profiles (id) on delete cascade,
  email_on_connection_request boolean not null default true,
  email_on_referral_request boolean not null default true,
  email_on_referral_response boolean not null default true,
  email_on_message boolean not null default true,
  email_on_town_hall_reply boolean not null default true,
  email_on_endorsement boolean not null default false,
  digest_frequency text not null default 'realtime', -- 'realtime' | 'daily' | 'weekly' | 'off'
  updated_at timestamptz not null default now(),
  constraint valid_digest_frequency check (digest_frequency in ('realtime', 'daily', 'weekly', 'off'))
);

-- Singular by design ("ASSIGNED EMERGENCY CONTACT" in the spec) - one
-- designated colleague per user who should be notified/looped in if the
-- user is unexpectedly unavailable and their caseload needs covering.
create table emergency_contacts (
  profile_id uuid primary key references profiles (id) on delete cascade,
  contact_profile_id uuid not null references profiles (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint no_self_emergency_contact check (profile_id <> contact_profile_id)
);

create table do_not_work_with (
  profile_id uuid not null references profiles (id) on delete cascade,
  blocked_profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, blocked_profile_id),
  constraint no_self_block check (profile_id <> blocked_profile_id)
);

alter table notification_preferences enable row level security;
alter table emergency_contacts enable row level security;
alter table do_not_work_with enable row level security;

create policy "own notification preferences only" on notification_preferences
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "own emergency contact only" on emergency_contacts
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "own blocklist only" on do_not_work_with
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create index idx_do_not_work_with_blocked on do_not_work_with (blocked_profile_id);
create index idx_emergency_contacts_contact on emergency_contacts (contact_profile_id);
