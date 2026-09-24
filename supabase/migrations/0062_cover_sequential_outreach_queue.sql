-- Product Spec v1, Cover wizard: sequential outreach.
-- When a plan owner chooses "one at a time", the remaining colleagues for
-- a case wait in outreach_queue. When the current request is declined,
-- this trigger immediately asks the next colleague, so the owner doesn't
-- have to come back and do it by hand. It runs as a security definer
-- because the declining colleague (who fires the update) can't write to
-- the owner's case under RLS.

alter table coverage_plan_cases
  add column if not exists outreach_queue uuid[] not null default '{}';

create or replace function public.advance_cover_outreach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case coverage_plan_cases%rowtype;
  v_owner uuid;
  v_next uuid;
  v_request_id bigint;
  v_event_id bigint;
begin
  if new.status <> 'declined' or old.status = 'declined' then
    return new;
  end if;

  select * into v_case from coverage_plan_cases where id = new.coverage_plan_case_id for update;
  if not found or coalesce(array_length(v_case.outreach_queue, 1), 0) = 0 then
    return new;
  end if;

  -- Only advance when nobody else is still being asked about this case.
  if exists (
    select 1 from coverage_requests r
    where r.coverage_plan_case_id = v_case.id and r.status = 'sent' and r.id <> new.id
  ) then
    return new;
  end if;

  select p.profile_id into v_owner from coverage_plans p where p.id = v_case.coverage_plan_id;

  -- Skip anyone already asked or since excluded, then take the next.
  select q into v_next
  from unnest(v_case.outreach_queue) with ordinality as t(q, ord)
  where not exists (select 1 from coverage_requests r where r.coverage_plan_case_id = v_case.id and r.requested_profile_id = t.q)
    and not exists (select 1 from coverage_case_rejections x where x.coverage_plan_case_id = v_case.id and x.candidate_profile_id = t.q)
  order by ord
  limit 1;

  update coverage_plan_cases
  set outreach_queue = array(
        select q from unnest(v_case.outreach_queue) with ordinality as t(q, ord)
        where v_next is not null and q <> v_next
          and not exists (select 1 from coverage_requests r where r.coverage_plan_case_id = v_case.id and r.requested_profile_id = t.q)
        order by ord
      )
  where id = v_case.id;

  if v_next is null then
    return new;
  end if;

  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, message)
  values (v_case.id, v_next, new.sequence_order + 1, new.message)
  returning id into v_request_id;

  update coverage_plan_cases set status = 'awaiting_response' where id = v_case.id;

  insert into notification_events (event_type, actor_profile_id, actor_type, dedup_key, deep_link, summary, metadata)
  values ('coverage_request', v_owner, 'system', 'coverage_request:' || v_request_id, '/dashboard/cover',
          'sent you a coverage request', jsonb_build_object('coveragePlanCaseId', v_case.id, 'coverageRequestId', v_request_id))
  returning id into v_event_id;

  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at)
  values (v_event_id, v_next, 'in_app', 'sent', now()),
         (v_event_id, v_next, 'email', 'pending', null);

  return new;
end;
$$;

drop trigger if exists trg_advance_cover_outreach on coverage_requests;
create trigger trg_advance_cover_outreach
  after update of status on coverage_requests
  for each row execute function public.advance_cover_outreach();

revoke all on function public.advance_cover_outreach() from public;
