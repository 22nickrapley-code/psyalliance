-- The Planner's decline-cascade ("Once rejected by Psychologist... goes to
-- next shortlisted Psychologist") needs to insert a NEW planner_offers row
-- while running as the CANDIDATE who just declined, not the project owner -
-- the existing insert policy only allows the project owner. Rather than add
-- a self-referential subquery on planner_offers to the insert policy (an
-- unnecessary echo of the profiles self-reference recursion bug fixed in
-- migration 0010), this uses a narrow SECURITY DEFINER function that
-- performs its own authorization check before inserting.
create or replace function create_planner_offer_as_owner(
  p_assignment_id bigint,
  p_candidate_profile_id uuid,
  p_message text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if not exists (
    select 1 from planner_assignments pa
    join planner_projects pp on pp.id = pa.project_id
    where pa.id = p_assignment_id and pp.profile_id = auth.uid()
  ) and not exists (
    select 1 from planner_offers po
    where po.assignment_id = p_assignment_id and po.candidate_profile_id = auth.uid()
  ) then
    raise exception 'not authorized to create an offer on this assignment';
  end if;

  insert into planner_offers (assignment_id, candidate_profile_id, message)
  values (p_assignment_id, p_candidate_profile_id, p_message)
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function create_planner_offer_as_owner(bigint, uuid, text) from public, anon;
grant execute on function create_planner_offer_as_owner(bigint, uuid, text) to authenticated;
