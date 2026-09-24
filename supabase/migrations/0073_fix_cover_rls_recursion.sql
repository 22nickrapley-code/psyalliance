-- Critical fix found by the two-account test: the Cover policies referred
-- to each other in a cycle (plans -> cases -> requests -> cases), so
-- Postgres raised "infinite recursion detected in policy for relation
-- coverage_plan_cases" on any cover plan insert or read. Ownership and
-- "asked to help" checks now go through security-definer helpers that
-- read the tables without re-entering their policies.

create or replace function private.owns_cover_plan(p_plan bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coverage_plans where id = p_plan and profile_id = auth.uid());
$$;

create or replace function private.owns_cover_case(p_case bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coverage_plan_cases c join coverage_plans p on p.id = c.coverage_plan_id
    where c.id = p_case and p.profile_id = auth.uid()
  );
$$;

create or replace function private.asked_about_cover_case(p_case bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coverage_requests where coverage_plan_case_id = p_case and requested_profile_id = auth.uid());
$$;

create or replace function private.asked_about_cover_plan(p_plan bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coverage_plan_cases c join coverage_requests r on r.coverage_plan_case_id = c.id
    where c.coverage_plan_id = p_plan and r.requested_profile_id = auth.uid()
  );
$$;

grant execute on function private.owns_cover_plan(bigint), private.owns_cover_case(bigint),
  private.asked_about_cover_case(bigint), private.asked_about_cover_plan(bigint) to authenticated;

drop policy if exists "requested clinicians can see plans they're asked to help with" on public.coverage_plans;
create policy "requested clinicians can see plans they're asked to help with" on public.coverage_plans
  for select using (private.asked_about_cover_plan(id));

drop policy if exists "plan owner manages their own cases" on public.coverage_plan_cases;
create policy "plan owner manages their own cases" on public.coverage_plan_cases
  for all using (private.owns_cover_plan(coverage_plan_id)) with check (private.owns_cover_plan(coverage_plan_id));

drop policy if exists "requested clinicians can see the case they're asked about" on public.coverage_plan_cases;
create policy "requested clinicians can see the case they're asked about" on public.coverage_plan_cases
  for select using (private.asked_about_cover_case(id));

drop policy if exists "plan owner manages outreach on their own cases" on public.coverage_requests;
create policy "plan owner manages outreach on their own cases" on public.coverage_requests
  for all using (private.owns_cover_case(coverage_plan_case_id)) with check (private.owns_cover_case(coverage_plan_case_id));
