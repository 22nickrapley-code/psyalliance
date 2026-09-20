-- Nick's Sept 20 feedback: the caseload "Insurance" field was free text
-- (typo-prone, no canonical list). Turns it into a dropdown sourced from
-- lookup_values (category = 'insurance'), same pattern already used for
-- treatment_specialism/session_type - with a request-to-add path for
-- anything missing, reviewed by an admin rather than self-service (keeps
-- the canonical list clean, same reasoning as credential verification
-- being human-reviewed rather than auto-approved).

create table if not exists insurance_requests (
  id bigint generated always as identity primary key,
  requested_by uuid not null references profiles(id) on delete cascade,
  requested_value text not null check (char_length(trim(requested_value)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists insurance_requests_status_idx on insurance_requests(status);

alter table insurance_requests enable row level security;

create policy "users can submit their own insurance requests"
  on insurance_requests for insert
  with check ((select auth.uid()) = requested_by);

create policy "users can see their own insurance requests"
  on insurance_requests for select
  using ((select auth.uid()) = requested_by);

create policy "admins can see all insurance requests"
  on insurance_requests for select
  using (is_admin_user((select auth.uid())));

create policy "admins can update insurance requests"
  on insurance_requests for update
  using (is_admin_user((select auth.uid())));

-- lookup_values had a SELECT-only policy (readable by any authenticated
-- user) and no write policy at all - fine until now, since only migrations
-- ever wrote to it. Approving an insurance request needs an admin to insert
-- a new row through the normal (RLS-respecting) client, same as every other
-- admin write in this app.
create policy "admins can add lookup values"
  on lookup_values for insert
  with check (is_admin_user((select auth.uid())));
