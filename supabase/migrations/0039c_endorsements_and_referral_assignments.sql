-- Recovered from the live migration history (applied 21 Sept 2026 as
-- "endorsements_and_referral_assignments" but never committed). Already
-- applied on both hosted projects; kept so a fresh database can be rebuilt.
create table if not exists endorsements (
  id bigint generated always as identity primary key,
  endorser_id uuid not null references profiles(id) on delete cascade,
  endorsee_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint endorsements_no_self check (endorser_id <> endorsee_id),
  unique (endorser_id, endorsee_id)
);

alter table endorsements enable row level security;

create policy "endorsements_select_all" on endorsements
  for select using (true);

create policy "endorsements_insert_self" on endorsements
  for insert with check (endorser_id = auth.uid());

create policy "endorsements_update_self" on endorsements
  for update using (endorser_id = auth.uid());

create policy "endorsements_delete_self" on endorsements
  for delete using (endorser_id = auth.uid());

create index if not exists endorsements_endorsee_idx on endorsements(endorsee_id);

create table if not exists referral_assignments (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  caseload_client_id bigint not null references caseload_clients(id) on delete cascade,
  assigned_profile_id uuid not null references profiles(id) on delete cascade,
  message text,
  status text not null default 'assigned',
  sent_to_patient boolean not null default false,
  sent_to_patient_at timestamptz,
  created_at timestamptz not null default now()
);

alter table referral_assignments enable row level security;

create policy "referral_assignments_select_own" on referral_assignments
  for select using (profile_id = auth.uid() or assigned_profile_id = auth.uid());

create policy "referral_assignments_insert_own" on referral_assignments
  for insert with check (profile_id = auth.uid());

create policy "referral_assignments_update_own" on referral_assignments
  for update using (profile_id = auth.uid());

create policy "referral_assignments_delete_own" on referral_assignments
  for delete using (profile_id = auth.uid());

create index if not exists referral_assignments_client_idx on referral_assignments(caseload_client_id);
create index if not exists referral_assignments_colleague_idx on referral_assignments(assigned_profile_id);
