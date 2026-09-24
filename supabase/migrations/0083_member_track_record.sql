-- A colleague's track record on their profile: counts only, computed on
-- the server, visible to anyone who can see the profile. Individual
-- professional events stay private to the people in them (0079).
drop function if exists public.member_track_record(uuid);
create function public.member_track_record(target uuid)
returns table(covers_completed bigint, colleagues_worked_with bigint, median_response_hours numeric, response_samples bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  with recent as (
    select response_time_seconds from professional_events e
    where e.actor_profile_id = target and e.response_time_seconds is not null and e.response_time_seconds > 0
    order by e.created_at desc limit 50
  ),
  worked as (
    select case when actor_profile_id = target then related_profile_id else actor_profile_id end as colleague
    from professional_events
    where event_type in ('coverage_completed', 'referral_outcome', 'consultation_response')
      and target in (actor_profile_id, related_profile_id)
      and actor_profile_id is not null and related_profile_id is not null
      and actor_profile_id <> related_profile_id
  )
  select
    (select count(*) from professional_events e where e.event_type = 'coverage_completed' and e.related_profile_id = target),
    (select count(distinct colleague) from worked),
    (select round((percentile_cont(0.5) within group (order by response_time_seconds) / 3600.0)::numeric, 1) from recent),
    (select count(*) from recent)
  where private.can_see_profile(target);
$$;
revoke execute on function public.member_track_record(uuid) from public, anon;
grant execute on function public.member_track_record(uuid) to authenticated;
