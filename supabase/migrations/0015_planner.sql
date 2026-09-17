-- M-extra: Planner - the bulk-coverage tool from the "Planner_Notes" sheet.
-- A psychologist going on leave creates a project (name + date range),
-- selects which active cases need covering, and the system ranks candidate
-- colleagues per case using the same weighted matching engine, auto-drafts
-- an outreach message, and offers to the top candidate. A decline cascades
-- to the next-ranked candidate automatically ("Once rejected by
-- Psychologist, User goes back to planner, removes Psy from that patient,
-- and then goes to next shortlisted Psychologist").

alter table caseload_clients add column city text;

create table planner_projects (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint valid_planner_status check (status in ('active', 'completed', 'cancelled')),
  constraint valid_planner_date_range check (end_date >= start_date)
);

create table planner_assignments (
  id bigint generated always as identity primary key,
  project_id bigint not null references planner_projects (id) on delete cascade,
  caseload_client_id bigint not null references caseload_clients (id) on delete cascade,
  status text not null default 'unassigned',
  created_at timestamptz not null default now(),
  constraint valid_assignment_status check (status in ('unassigned', 'offered', 'accepted', 'exhausted')),
  unique (project_id, caseload_client_id)
);

create table planner_offers (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references planner_assignments (id) on delete cascade,
  candidate_profile_id uuid not null references profiles (id) on delete cascade,
  message text not null,
  status text not null default 'offered',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint valid_offer_status check (status in ('offered', 'accepted', 'declined', 'withdrawn')),
  unique (assignment_id, candidate_profile_id)
);

create index idx_planner_assignments_project on planner_assignments (project_id);
create index idx_planner_offers_assignment on planner_offers (assignment_id);
create index idx_planner_offers_candidate on planner_offers (candidate_profile_id);

alter table planner_projects enable row level security;
alter table planner_assignments enable row level security;
alter table planner_offers enable row level security;

create policy "own planner projects only" on planner_projects
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "manage assignments on your own projects" on planner_assignments
  for all using (
    exists (select 1 from planner_projects pp where pp.id = project_id and pp.profile_id = (select auth.uid()))
  ) with check (
    exists (select 1 from planner_projects pp where pp.id = project_id and pp.profile_id = (select auth.uid()))
  );

create policy "see offers you sent or received" on planner_offers
  for select using (
    candidate_profile_id = (select auth.uid())
    or exists (
      select 1 from planner_assignments pa
      join planner_projects pp on pp.id = pa.project_id
      where pa.id = assignment_id and pp.profile_id = (select auth.uid())
    )
  );

create policy "project owners create offers" on planner_offers
  for insert with check (
    exists (
      select 1 from planner_assignments pa
      join planner_projects pp on pp.id = pa.project_id
      where pa.id = assignment_id and pp.profile_id = (select auth.uid())
    )
  );

create policy "candidate or project owner can update an offer" on planner_offers
  for update using (
    candidate_profile_id = (select auth.uid())
    or exists (
      select 1 from planner_assignments pa
      join planner_projects pp on pp.id = pa.project_id
      where pa.id = assignment_id and pp.profile_id = (select auth.uid())
    )
  );
