-- Rebuild Phase 4, batch 2: Coverage. "Coverage remains the primary
-- acquisition proposition" (Master Brief #19) - this is the module that
-- doesn't exist today (BUILD NEW in the Phase 1/2 audit) and everything
-- else in Phase 5+ Coverage UX sits on top of it.
--
-- Data-boundary rule (Addendum A7, Level 1 only): every column here is
-- structured, non-identifying matching data - jurisdiction, age band,
-- service needed, specialty, modality, insurance, dates, timing. No
-- patient name or other identifier belongs in this table, ever - that's
-- Level 3 and explicitly out of scope for V1 PsyAlliance infrastructure.
-- case_reference is the clinician's own short private label (e.g. "Tuesday
-- 4pm, adult anxiety"), not a patient identifier.

create type coverage_plan_type as enum ('reciprocal', 'extended_leave', 'ad_hoc');
-- PA-02's four extended-leave planning tracks (Master Brief's own naming).
create type coverage_plan_track as enum ('pause_return', 'covered_continuity', 'temporary_transfer', 'refer_out');
create type coverage_plan_status as enum ('draft', 'active', 'completed', 'cancelled');
create type coverage_case_status as enum ('needs_cover', 'awaiting_response', 'confirmed', 'declined_all');
create type coverage_request_status as enum ('sent', 'accepted', 'declined', 'discussing', 'expired');

create table coverage_plans (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  plan_type coverage_plan_type not null default 'ad_hoc',
  -- Only meaningful when plan_type = 'extended_leave' (PA-02's 4 tracks).
  track coverage_plan_track,
  title text not null check (char_length(trim(title)) > 0),
  starts_on date,
  ends_on date,
  status coverage_plan_status not null default 'draft',
  -- Only meaningful when plan_type = 'reciprocal' (PA-01): the other
  -- clinician in the two-way reciprocal arrangement.
  reciprocal_partner_profile_id uuid references profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_date_range check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index idx_coverage_plans_profile on coverage_plans (profile_id);
create index idx_coverage_plans_status on coverage_plans (status);

create table coverage_plan_cases (
  id bigint generated always as identity primary key,
  coverage_plan_id bigint not null references coverage_plans (id) on delete cascade,
  -- The clinician's own private short reference - NEVER a patient name.
  case_reference text not null check (char_length(trim(case_reference)) > 0),
  specialism_lookup_ids bigint[] not null default '{}',
  age_band text,
  service_needed text,
  modality text,
  insurance text,
  frequency text,
  status coverage_case_status not null default 'needs_cover',
  assigned_clinician_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column coverage_plan_cases.case_reference is
  'Clinician''s own private short label for their own reference only - never a patient name or other identifier (Addendum A7, Level 1 data only).';

create index idx_coverage_plan_cases_plan on coverage_plan_cases (coverage_plan_id);
create index idx_coverage_plan_cases_status on coverage_plan_cases (status);

-- Sequential, pre-approved outreach (Master Brief #20-21): when a case
-- needs cover, suggested clinicians are asked in order, one active request
-- at a time or a batch, until one accepts - "if someone declines, surface
-- the next suitable option immediately". sequence_order records the
-- planned order; multiple rows can be 'sent' at once for parallel outreach.
create table coverage_requests (
  id bigint generated always as identity primary key,
  coverage_plan_case_id bigint not null references coverage_plan_cases (id) on delete cascade,
  requested_profile_id uuid not null references profiles (id) on delete cascade,
  sequence_order integer not null default 0,
  status coverage_request_status not null default 'sent',
  message text,
  sent_at timestamptz not null default now(),
  responded_at timestamptz
);

create index idx_coverage_requests_case on coverage_requests (coverage_plan_case_id);
create index idx_coverage_requests_requested on coverage_requests (requested_profile_id);

alter table coverage_plans enable row level security;
alter table coverage_plan_cases enable row level security;
alter table coverage_requests enable row level security;

create policy "own coverage plans only" on coverage_plans
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- Anyone requested for a case can see the plan they've been asked to help
-- with, not just the plan owner - they need enough context (title, dates)
-- to decide, without necessarily seeing every other case in the plan.
create policy "requested clinicians can see plans they're asked to help with" on coverage_plans
  for select using (
    exists (
      select 1 from coverage_plan_cases c
      join coverage_requests r on r.coverage_plan_case_id = c.id
      where c.coverage_plan_id = coverage_plans.id and r.requested_profile_id = (select auth.uid())
    )
  );

create policy "plan owner manages their own cases" on coverage_plan_cases
  for all using (
    exists (select 1 from coverage_plans p where p.id = coverage_plan_id and p.profile_id = (select auth.uid()))
  ) with check (
    exists (select 1 from coverage_plans p where p.id = coverage_plan_id and p.profile_id = (select auth.uid()))
  );

create policy "requested clinicians can see the case they're asked about" on coverage_plan_cases
  for select using (
    exists (
      select 1 from coverage_requests r
      where r.coverage_plan_case_id = coverage_plan_cases.id and r.requested_profile_id = (select auth.uid())
    )
  );

create policy "plan owner manages outreach on their own cases" on coverage_requests
  for all using (
    exists (
      select 1 from coverage_plan_cases c
      join coverage_plans p on p.id = c.coverage_plan_id
      where c.id = coverage_plan_case_id and p.profile_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from coverage_plan_cases c
      join coverage_plans p on p.id = c.coverage_plan_id
      where c.id = coverage_plan_case_id and p.profile_id = (select auth.uid())
    )
  );

create policy "requested clinician can see and respond to their own request" on coverage_requests
  for select using ((select auth.uid()) = requested_profile_id);

create policy "requested clinician can update their own response" on coverage_requests
  for update using ((select auth.uid()) = requested_profile_id)
  with check ((select auth.uid()) = requested_profile_id);
