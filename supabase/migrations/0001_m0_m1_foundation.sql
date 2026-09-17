-- PsyAlliance schema: M0 (foundation/auth/credential) + M1 (solo practice toolkit)
-- Scaffold, not final production DDL. No real patient-identifying data is
-- permitted in this schema yet (client_identifier is a short initials-only
-- code) - see .env.example HIPAA_MODE_ENABLED note before that changes.

-- ============================================================
-- M0: profiles, credentials, lookup values
-- ============================================================

create type qualification_level as enum ('PhD', 'PsyD', 'EdD', 'MD');
create type verification_status as enum ('pending', 'verified', 'flagged', 'rejected');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  credential_prefix text,                    -- e.g. "Dr"
  qualification_level qualification_level not null,
  board_certified boolean not null default false,
  primary_practice_city text,
  states_qualified text[] not null default '{}',
  primary_state text,                        -- states_qualified[1], denormalized for fast public queries
  accepting_referrals boolean not null default true,
  verification_status verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every structured attribute a profile can carry (specialism, modality,
-- insurance, language, etc.) comes from one generic lookup domain instead of
-- N one-off tables, so new domains (from the "Dropdown Lists" sheet) don't
-- need a schema change - just new rows.
create table lookup_values (
  id bigint generated always as identity primary key,
  category text not null,        -- 'treatment_specialism' | 'treatment_modality' | 'insurance' | 'language' | 'session_type' | ...
  value text not null,
  unique (category, value)
);

create table profile_lookup_values (
  profile_id uuid not null references profiles (id) on delete cascade,
  lookup_value_id bigint not null references lookup_values (id),
  rank smallint,                 -- 1-5 for specialisms/modalities per the original spec; null where rank doesn't apply
  primary key (profile_id, lookup_value_id)
);

-- Credential verification: state board / ASPPB / NPI lookups, AI pre-check,
-- human (Nick/Rena) sign-off on anything that doesn't cleanly match.
create table credential_verifications (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  source text not null,           -- 'state_board' | 'asppb' | 'npi_registry'
  state text,
  license_number text not null,
  raw_result jsonb,
  matched boolean not null default false,
  flagged_reason text,
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Public query surface (M4 down payment): only verified, non-sensitive
-- fields are exposed here. Direct table access is revoked from anon/
-- authenticated below; this view is the only public read path.
-- ============================================================

create view public_directory as
select
  p.id,
  p.full_name,
  p.credential_prefix,
  p.qualification_level,
  p.board_certified,
  p.primary_practice_city,
  p.primary_state,
  p.accepting_referrals,
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified';

-- ============================================================
-- M1: solo practice toolkit - caseload, income, capacity, overhead, documents
-- ============================================================

create table books_of_business (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,                 -- e.g. "Luz" (own private-pay practice), "Blue Skies" (group-practice affiliation)
  expense_burden_pct numeric(4, 3) not null check (expense_burden_pct between 0 and 1), -- fraction RETAINED, e.g. 0.85
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table caseload_clients (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  book_of_business_id bigint references books_of_business (id),
  client_identifier varchar(6) not null,   -- initials only, e.g. "NR" - never a real name
  state text,
  session_type text,                       -- 'F2F' | 'Virtual'
  insurance text,
  primary_need text,
  secondary_need text,
  tertiary_need text,
  rate_per_session numeric(8, 2),
  sessions_per_week numeric(4, 2),         -- fractional, e.g. 0.5 = every other week
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint client_identifier_not_a_name check (char_length(client_identifier) <= 6)
);

create table capacity_settings (
  profile_id uuid primary key references profiles (id) on delete cascade,
  target_sessions_per_week numeric(4, 2),
  annual_vacation_days smallint,
  no_show_rate_pct numeric(4, 3),
  missed_session_charge_pct numeric(4, 3)  -- 1.0 = charge full amount, 0 = no charge
);

create table practice_overhead_expenses (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  expense_name text not null,
  vendor text,
  cadence text not null,                   -- 'annual' | 'monthly'
  amount numeric(10, 2) not null,
  monthly_cost numeric(10, 2) not null,
  notes text
);

create table documents (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  owner_scope text not null default 'personal', -- 'personal' | 'world' (shared library)
  title text not null,
  treatment_area text,
  storage_path text not null,              -- Supabase Storage object path; file bytes never leave Storage
  uploaded_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row-level security: private tables are owner-only; profiles/lookup data
-- are readable by their owner directly, and by anyone ONLY through
-- public_directory (base table select is revoked below).
-- ============================================================

alter table profiles enable row level security;
alter table lookup_values enable row level security;
alter table profile_lookup_values enable row level security;
alter table credential_verifications enable row level security;
alter table books_of_business enable row level security;
alter table caseload_clients enable row level security;
alter table capacity_settings enable row level security;
alter table practice_overhead_expenses enable row level security;
alter table documents enable row level security;

create policy "own profile only" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "lookup values are readable by any authenticated user" on lookup_values
  for select using (auth.role() = 'authenticated');

create policy "own profile lookup values only" on profile_lookup_values
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own credential records only" on credential_verifications
  for select using (auth.uid() = profile_id);

create policy "own books of business only" on books_of_business
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own caseload only" on caseload_clients
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own capacity settings only" on capacity_settings
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own overhead expenses only" on practice_overhead_expenses
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own documents only" on documents
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

revoke select on profiles from anon, authenticated;
grant select on profiles to authenticated; -- RLS policy above still restricts to own row
grant select on public_directory to anon, authenticated;
