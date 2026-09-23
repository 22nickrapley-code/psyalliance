-- Task #132 (Sept 23 audit), approved cut: ports the legacy Planner's
-- inline "-" reject-a-candidate action (referral_rejections, scoped to
-- caseload_client_id) into the new Coverage engine, scoped to
-- coverage_plan_case_id instead. NOT a reuse of referral_rejections itself
-- - that table has no path to a coverage_plan_case_id (coverage_plan_cases
-- has no caseload_client_id FK, just a free-text case_reference), so this
-- is a small new table with the same shape and the same RLS pattern
-- (profile_id = auth.uid() directly, no join needed since the row is
-- always written by the plan owner themselves).
--
-- Lets a plan owner manually drop a suggested clinician from a specific
-- case's ranked list (e.g. "I know they're not a fit for this one")
-- without going through a full send/decline request cycle -
-- suggestCliniciansForCase's excludeProfileIds param (already added for
-- the "don't re-suggest someone who already declined" fix) reads these
-- the same way it reads coverage_requests history.

create table coverage_case_rejections (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  coverage_plan_case_id bigint not null references coverage_plan_cases (id) on delete cascade,
  candidate_profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coverage_plan_case_id, candidate_profile_id)
);

create index idx_coverage_case_rejections_case on coverage_case_rejections (coverage_plan_case_id);

alter table coverage_case_rejections enable row level security;

create policy "coverage_case_rejections_select_own" on coverage_case_rejections
  for select using (profile_id = (select auth.uid()));

create policy "coverage_case_rejections_insert_own" on coverage_case_rejections
  for insert with check (profile_id = (select auth.uid()));

create policy "coverage_case_rejections_delete_own" on coverage_case_rejections
  for delete using (profile_id = (select auth.uid()));
