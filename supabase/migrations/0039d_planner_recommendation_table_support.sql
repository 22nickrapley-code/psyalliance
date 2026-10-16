-- Recovered from the live migration history (applied 21 Sept 2026 as
-- "planner_recommendation_table_support" but never committed). Already
-- applied on both hosted projects; kept so a fresh database can be rebuilt.
create table if not exists referral_rejections (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  caseload_client_id bigint not null references caseload_clients(id) on delete cascade,
  candidate_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, caseload_client_id, candidate_profile_id)
);

alter table referral_rejections enable row level security;

create policy "referral_rejections_select_own" on referral_rejections
  for select using (profile_id = auth.uid());

create policy "referral_rejections_insert_own" on referral_rejections
  for insert with check (profile_id = auth.uid());

create policy "referral_rejections_delete_own" on referral_rejections
  for delete using (profile_id = auth.uid());

create index if not exists referral_rejections_client_idx on referral_rejections(caseload_client_id);

alter table referral_assignments add column if not exists satisfaction_rating text;
alter table referral_assignments drop constraint if exists referral_assignments_satisfaction_check;
alter table referral_assignments add constraint referral_assignments_satisfaction_check
  check (satisfaction_rating is null or satisfaction_rating in ('down', 'up', 'heart'));
