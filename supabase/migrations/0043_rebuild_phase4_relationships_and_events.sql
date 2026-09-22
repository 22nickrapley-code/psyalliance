-- Rebuild Phase 4, batch 2: relabels existing accepted 'partner' connections
-- to the new 'trusted_colleague' tier, adds Saved Clinicians (private,
-- unilateral - distinct from the mutual Trusted Colleague flow), extends
-- the existing private-exclusion list to also cover the stronger Block,
-- adds the single professional event log (Addendum A4), a "worked with
-- before" view derived from it, the agent-readiness/Founding Member fields
-- on profiles, and the founding cohorts admin table.

-- Existing accepted partner connections are, in substance, already what the
-- spec calls Trusted Colleagues (mutual, explicit, chosen by the
-- clinician) - relabel rather than duplicate. Pending/declined 'partner'
-- rows are left alone; they aren't a relationship yet.
update connections set tier = 'trusted_colleague'
where tier = 'partner' and status = 'accepted';

-- ---------------------------------------------------------------------------
-- Saved Clinicians (Master Brief #28): "people the member may wish to work
-- with or remember" - private and unilateral, unlike Trusted Colleague. No
-- accept/decline flow, no notification to the other person: saving someone
-- is purely the saver's own reference list.
create table saved_clinicians (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  clinician_id uuid not null references profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  constraint no_self_save check (profile_id <> clinician_id),
  unique (profile_id, clinician_id)
);

alter table saved_clinicians enable row level security;

create policy "own saved clinicians only" on saved_clinicians
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create index idx_saved_clinicians_clinician on saved_clinicians (clinician_id);

-- Private Exclude vs. stronger Block (Master Brief #30, Addendum A8): both
-- are a private per-user list that suppresses recommendations and never
-- notifies the other person - do_not_work_with already is exactly that
-- table, so it's extended rather than replaced. Block additionally implies
-- suppressing incoming contact (e.g. new message requests) - that's Phase
-- 5+ (Messages/Network) application logic on top of this same flag, not a
-- new schema shape.
alter table do_not_work_with
  add column if not exists block_type text not null default 'exclude'
    check (block_type in ('exclude', 'block'));

-- ---------------------------------------------------------------------------
-- The single structured, de-identified professional event log (Addendum
-- A4). Every module the rebuild adds (Coverage, Referrals, Consult,
-- reciprocal agreements, Library workflows) logs here, from day one, even
-- before the Reliability architecture that reads it is switched on -
-- "log first, activate later" is the explicit instruction, so history
-- exists once a sufficient-evidence threshold is defined.
--
-- Hard rule from A4, enforced by convention (not by the database - a check
-- constraint can't verify free text is clinically safe): summary and
-- metadata must never contain a patient name, other patient identifier, or
-- clinical narrative. Only structured, de-identified facts belong here.
create table professional_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'availability_confirmed',
    'trusted_invitation_sent',
    'trusted_invitation_accepted',
    'external_invitation_sent',
    'external_invitation_converted',
    'coverage_request_sent',
    'coverage_response',
    'coverage_confirmed',
    'coverage_completed',
    'referral_sent',
    'referral_response',
    'referral_waitlisted',
    'referral_outcome',
    'consultation_created',
    'consultation_response',
    'collaboration_established',
    'reciprocal_coverage_established',
    'library_workflow_launched',
    'professional_relationship_created',
    'new_member'
  )),
  actor_profile_id uuid references profiles (id) on delete set null,
  actor_type actor_type not null default 'member_web',
  subject_profile_id uuid references profiles (id) on delete set null,
  related_profile_id uuid references profiles (id) on delete set null,
  specialism_lookup_ids bigint[] not null default '{}',
  state text,
  response_time_seconds integer,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table professional_events is
  'Structured, de-identified professional interaction history (Addendum A4). Never store patient names, other patient identifiers, or clinical free text here.';

create index idx_professional_events_actor on professional_events (actor_profile_id);
create index idx_professional_events_subject on professional_events (subject_profile_id);
create index idx_professional_events_related on professional_events (related_profile_id);
create index idx_professional_events_type_created on professional_events (event_type, created_at desc);

alter table professional_events enable row level security;

-- De-identified by design, so readable network-wide (same basis as the
-- member directory itself) - this is what lets Reliability/"Worked with
-- before" be computed about a third party during matching, not just about
-- yourself. Never expose the raw rows as a public feed in the UI though;
-- product surfaces should only ever show derived signals (Addendum A4:
-- "Usually responds quickly"), not this table directly.
create policy "professional events are readable network-wide" on professional_events
  for select using ((select auth.uid()) is not null);

create policy "insert your own events, or as admin/system" on professional_events
  for insert with check (
    (select auth.uid()) = actor_profile_id
    or actor_type in ('admin', 'system')
  );

-- Worked With Before (Master Brief #28-29): "derived from genuine platform
-- history", becomes active after the first completed interaction. A view,
-- not a stored relationship - it can never go stale or be manually edited,
-- and it naturally starts out empty for everyone until the modules that
-- log 'coverage_completed' / 'referral_outcome' / 'consultation_response'
-- events exist (Phase 8+). profile_id is whichever side of the pair you
-- query it for; colleague_id is the other side, with the most recent
-- completed interaction and a running count.
create view worked_with_before as
with completed as (
  select
    actor_profile_id as profile_id,
    related_profile_id as colleague_id,
    created_at
  from professional_events
  where event_type in ('coverage_completed', 'referral_outcome', 'consultation_response')
    and related_profile_id is not null
  union all
  select
    related_profile_id as profile_id,
    actor_profile_id as colleague_id,
    created_at
  from professional_events
  where event_type in ('coverage_completed', 'referral_outcome', 'consultation_response')
    and actor_profile_id is not null
)
select
  profile_id,
  colleague_id,
  count(*) as interaction_count,
  max(created_at) as last_interaction_at
from completed
where profile_id <> colleague_id
group by profile_id, colleague_id;

-- ---------------------------------------------------------------------------
-- Founding Member programme (Addendum Part C) and agent-readiness (Part B).
-- Caps and cohorts are admin-configurable data, never hard-coded in
-- application code - founding_cohorts is that configuration surface.
create table founding_cohorts (
  id bigint generated always as identity primary key,
  name text not null,
  region text,
  member_cap integer,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint positive_cap check (member_cap is null or member_cap > 0)
);

alter table founding_cohorts enable row level security;

create policy "founding cohorts are readable network-wide" on founding_cohorts
  for select using ((select auth.uid()) is not null);

create policy "admins manage founding cohorts" on founding_cohorts
  for all using (is_admin_user((select auth.uid())))
  with check (is_admin_user((select auth.uid())));

alter table profiles
  add column if not exists founding_cohort_id bigint references founding_cohorts (id) on delete set null,
  add column if not exists founding_member_since timestamptz,
  -- Addendum B3.4: defaults off, zero V1 effect - not read by any matching
  -- or search logic yet. Exists now purely so the future opt-in flow has a
  -- column to write to without another migration.
  add column if not exists public_discovery_opt_in boolean not null default false;

comment on column profiles.public_discovery_opt_in is
  'Future public-discovery access tier (Addendum Part B). Defaults off; not read by any V1 matching, search, or ranking logic.';
