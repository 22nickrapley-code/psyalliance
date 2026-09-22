-- Rebuild Phase 4, batch 4: Consult (PsyA2 #56-67, PA-04/PA-05). Replaces
-- Town Hall specialist channels at the product level (Addendum A8) - this
-- migration only adds the new tables; the Town Hall UI/code itself is
-- reviewed and migrated in a later phase, not touched here.
--
-- Status/type/audience fields use text + check rather than a Postgres enum
-- throughout this migration (unlike Coverage/Referrals) since PA-05's type
-- list and the tag vocabulary are exactly the kind of thing likely to grow
-- - a check constraint is a one-line migration to extend; an enum value
-- addition has the two-transaction dance seen in the earlier Phase 4
-- migrations.

create table consultations (
  id bigint generated always as identity primary key,
  author_profile_id uuid not null references profiles (id) on delete cascade,
  -- Step 1 of the composer (#58): a specific question, not an open story.
  question text not null check (char_length(trim(question)) > 0),
  consultation_type text check (consultation_type in (
    'diagnostic_clarification', 'treatment_impasse', 'risk', 'ethics_legal',
    'boundaries_countertransference', 'medication_split_treatment',
    'termination_transfer', 'referral_recommendation', 'practice_question', 'other'
  )),
  audience_type text not null default 'wider_network'
    check (audience_type in ('trusted', 'selected', 'wider_network')),
  audience_profile_ids uuid[] not null default '{}',
  tags text[] not null default '{}',
  context text,
  -- Step 6: required confirmation before a case-detail consultation can be
  -- opened to a wider audience (#59-60) - the database can't verify the
  -- content is actually de-identified, only that the member affirmed it.
  deidentification_confirmed boolean not null default false,
  -- Optional structured case format (#60), trusted/selected audiences
  -- only. jsonb rather than ten nullable columns - expected keys:
  -- age_range, cultural_context, presenting_issue, working_formulation,
  -- treatment_so_far, current_level_of_care, risk_summary,
  -- interventions_tried, stuck_point, constraints. Never a patient name.
  case_detail jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'responses_received', 'resolved', 'archived', 'removed')),
  decision_needed_by date,
  group_id bigint,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  archived_at timestamptz,
  constraint case_detail_requires_confirmation check (
    case_detail = '{}'::jsonb or deidentification_confirmed = true or status = 'draft'
  )
);

comment on column consultations.case_detail is
  'Structured optional case format (PsyA2 #60) - de-identified only, never a patient name or other identifier. Expected keys: age_range, cultural_context, presenting_issue, working_formulation, treatment_so_far, current_level_of_care, risk_summary, interventions_tried, stuck_point, constraints.';

create index idx_consultations_author on consultations (author_profile_id);
create index idx_consultations_status on consultations (status);
create index idx_consultations_group on consultations (group_id);

-- Reply, or a clarifying question - "Message privately" (#61) routes to
-- the existing Messages/conversations system instead of a row here.
create table consultation_responses (
  id bigint generated always as identity primary key,
  consultation_id bigint not null references consultations (id) on delete cascade,
  responder_profile_id uuid not null references profiles (id) on delete cascade,
  response_type text not null default 'reply' check (response_type in ('reply', 'clarifying_question')),
  body text not null check (char_length(trim(body)) > 0),
  -- Author-only, private "mark as useful" (#61) - explicitly not a public
  -- like-count/leaderboard.
  marked_useful boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_consultation_responses_consultation on consultation_responses (consultation_id);

-- PA-04 closed peer consultation groups (#63-67).
create table consultation_groups (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) > 0),
  purpose text,
  created_by uuid not null references profiles (id) on delete cascade,
  cadence text,
  meeting_length_minutes integer,
  meeting_format text check (meeting_format in ('in_person', 'video', 'hybrid')),
  -- PA-04 used as a dynamic working document (#65) - charter_version
  -- increments each time the charter body changes.
  charter_version integer not null default 1,
  charter_body text,
  created_at timestamptz not null default now()
);

alter table consultations
  add constraint consultations_group_id_fkey foreign key (group_id) references consultation_groups (id) on delete set null;

create table consultation_group_members (
  id bigint generated always as identity primary key,
  group_id bigint not null references consultation_groups (id) on delete cascade,
  -- Null for an external clinician invited but not yet a PsyAlliance
  -- member (#64's cold-start invite) - external_email is then required.
  profile_id uuid references profiles (id) on delete cascade,
  external_email text,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'left', 'removed')),
  role text not null default 'member' check (role in ('creator', 'coordinator', 'member')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint member_identity_present check (profile_id is not null or external_email is not null)
);

create unique index idx_consultation_group_members_profile on consultation_group_members (group_id, profile_id) where profile_id is not null;
create index idx_consultation_group_members_group on consultation_group_members (group_id);

-- ---------------------------------------------------------------------------
alter table consultations enable row level security;
alter table consultation_responses enable row level security;
alter table consultation_groups enable row level security;
alter table consultation_group_members enable row level security;

create policy "author manages their own consultations" on consultations
  for all using ((select auth.uid()) = author_profile_id) with check ((select auth.uid()) = author_profile_id);

-- Same audience-aware shape as the Referrals rebuild policy: wider_network
-- is network-visible; selected is visible only to the named profiles;
-- trusted is visible only to the author's accepted trusted colleagues.
-- Group-posted consultations are additionally visible to any member of
-- that group, whatever the audience_type says (a group is itself a
-- trusted/selected audience by construction).
create policy "consultations are visible per their chosen audience" on consultations
  for select using (
    status not in ('draft', 'removed')
    and (
      audience_type = 'wider_network'
      or (audience_type = 'selected' and (select auth.uid()) = any (audience_profile_ids))
      or (
        audience_type = 'trusted'
        and exists (
          select 1 from connections c
          where c.tier = 'trusted_colleague' and c.status = 'accepted'
            and (
              (c.requester_id = author_profile_id and c.addressee_id = (select auth.uid()))
              or (c.addressee_id = author_profile_id and c.requester_id = (select auth.uid()))
            )
        )
      )
      or (
        group_id is not null
        and exists (
          select 1 from consultation_group_members m
          where m.group_id = consultations.group_id and m.profile_id = (select auth.uid()) and m.status = 'joined'
        )
      )
    )
  );

create policy "see responses on consultations you can see, or your own" on consultation_responses
  for select using (
    (select auth.uid()) = responder_profile_id
    or exists (select 1 from consultations c where c.id = consultation_id)
  );

create policy "respond to a consultation you can see" on consultation_responses
  for insert with check (
    (select auth.uid()) = responder_profile_id
    and exists (select 1 from consultations c where c.id = consultation_id)
  );

create policy "consultation groups are visible to members, or their creator" on consultation_groups
  for select using (
    (select auth.uid()) = created_by
    or exists (
      select 1 from consultation_group_members m
      where m.group_id = consultation_groups.id and m.profile_id = (select auth.uid())
    )
  );

create policy "creator manages their own group" on consultation_groups
  for all using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

create policy "members see their own group's membership list" on consultation_group_members
  for select using (
    (select auth.uid()) = profile_id
    or exists (
      select 1 from consultation_groups g
      where g.id = group_id and (g.created_by = (select auth.uid())
        or exists (select 1 from consultation_group_members m2 where m2.group_id = g.id and m2.profile_id = (select auth.uid())))
    )
  );

create policy "group creator manages membership" on consultation_group_members
  for all using (
    exists (select 1 from consultation_groups g where g.id = group_id and g.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from consultation_groups g where g.id = group_id and g.created_by = (select auth.uid()))
  );

create policy "invited member can respond to their own invitation" on consultation_group_members
  for update using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);
