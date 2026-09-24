-- Found while preparing the demo network: when an invited colleague
-- answered a cover request, the app tried to update the case's status as
-- that colleague, but only the plan owner may write cases, so the update
-- silently did nothing. The owner's plan never showed a case as covered.
-- The case status now follows its requests in the database.

create or replace function public.sync_cover_case_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'accepted' then
    update coverage_plan_cases
    set status = 'confirmed', assigned_clinician_id = new.requested_profile_id
    where id = new.coverage_plan_case_id;
  elsif new.status in ('declined', 'expired') then
    -- Still waiting on someone (including the next colleague the
    -- sequential queue just asked)? Leave it. Otherwise it needs cover.
    if not exists (
      select 1 from coverage_requests r
      where r.coverage_plan_case_id = new.coverage_plan_case_id and r.status in ('sent', 'discussing') and r.id <> new.id
    ) and not exists (
      select 1 from coverage_requests r
      where r.coverage_plan_case_id = new.coverage_plan_case_id and r.status = 'accepted'
    ) then
      update coverage_plan_cases set status = 'needs_cover' where id = new.coverage_plan_case_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_cover_case_status() from public, anon, authenticated;

drop trigger if exists sync_cover_case_status on public.coverage_requests;
create trigger sync_cover_case_status
  after update of status on public.coverage_requests
  for each row execute function public.sync_cover_case_status();
