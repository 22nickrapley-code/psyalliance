-- M-extra: license/CE tracker and insurance-panel tracker, from the general
-- "practice management" needs any independent psychologist has (renewing a
-- license, logging CE hours toward a license cycle, tracking which
-- insurance panels they're credentialed with) - not explicitly itemized in
-- the spreadsheet but a natural companion to the existing Capacity/overhead
-- tracker, and squarely inside "anything else psychologists/psychiatrists
-- would want in a virtual private practice platform."
--
-- Also adds profiles.npi_number to support an automated NPI-registry
-- pre-check that feeds the existing credential_verifications queue.

alter table profiles add column npi_number text;

create table licenses (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  state text not null,
  license_number text not null,
  license_type text,
  issued_date date,
  expiration_date date,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  constraint valid_license_status check (status in ('active', 'expired', 'lapsed', 'pending_renewal'))
);

create table continuing_education_credits (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  provider text,
  category text,
  hours numeric(5, 2) not null check (hours > 0),
  completed_date date not null,
  license_id bigint references licenses (id) on delete set null,
  created_at timestamptz not null default now()
);

create table insurance_panels (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  insurance_name text not null,
  status text not null default 'in_network',
  effective_date date,
  renewal_date date,
  notes text,
  created_at timestamptz not null default now(),
  constraint valid_panel_status check (status in ('in_network', 'pending', 'out_of_network', 'terminated'))
);

create index idx_licenses_profile on licenses (profile_id);
create index idx_licenses_expiration on licenses (expiration_date);
create index idx_ce_credits_profile on continuing_education_credits (profile_id);
create index idx_insurance_panels_profile on insurance_panels (profile_id);
create index idx_insurance_panels_renewal on insurance_panels (renewal_date);

alter table licenses enable row level security;
alter table continuing_education_credits enable row level security;
alter table insurance_panels enable row level security;

create policy "own licenses only" on licenses
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "own ce credits only" on continuing_education_credits
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "own insurance panels only" on insurance_panels
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);
