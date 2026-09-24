-- Admin metrics that mean something. Demo accounts, accounts using the
-- demo view and operator (admin-only) logins are never counted. Supply is
-- reported in three honest steps: registered, verified, and actually
-- eligible (verified, active, reviewed in-date licence) and available
-- (eligible, open to referrals or cover, availability confirmed in the
-- last 30 days and not paused). Activity comes from real rows.

create or replace function public.admin_network_metrics()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  result jsonb;
  since timestamptz := now() - interval '30 days';
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with real_clinicians as (
    select p.* from profiles p
    where not p.is_demo and not p.demo_view and p.account_kind = 'clinician'
  ),
  eligible as (
    select r.* from real_clinicians r where private.is_network_member(r.id)
  ),
  available as (
    select e.* from eligible e
    where (e.referral_availability in ('yes', 'limited') or e.coverage_availability in ('yes', 'ask_me'))
      and e.availability_confirmed_at >= now() - interval '30 days'
      and (e.availability_paused_until is null or e.availability_paused_until < current_date)
  ),
  real_ids as (select id from real_clinicians),
  ref as (
    select rr.id, rr.created_at,
      (select min(resp.created_at) from referral_responses resp where resp.referral_request_id = rr.id) as first_reply
    from referral_requests rr
    where rr.requesting_profile_id in (select id from real_ids) and rr.created_at >= since
  ),
  cov as (
    select cr.id, cr.status::text as status, cr.sent_at, cr.responded_at
    from coverage_requests cr
    join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
    join coverage_plans pl on pl.id = c.coverage_plan_id
    where pl.profile_id in (select id from real_ids) and coalesce(cr.sent_at, now()) >= since
  ),
  inv as (
    select c.status::text as status from connections c
    where c.requester_id in (select id from real_ids) and c.created_at >= since
  ),
  con as (
    select c.id, exists (select 1 from consultation_responses r where r.consultation_id = c.id) as answered
    from consultations c
    where c.author_profile_id in (select id from real_ids) and c.status not in ('draft', 'removed') and c.created_at >= since
  )
  select jsonb_build_object(
    'registered', (select count(*) from real_clinicians),
    'pending', (select count(*) from real_clinicians where verification_status = 'pending'),
    'flagged', (select count(*) from real_clinicians where verification_status = 'flagged'),
    'rejected', (select count(*) from real_clinicians where verification_status = 'rejected'),
    'verified', (select count(*) from real_clinicians where verification_status = 'verified'),
    'verified_without_licence', (select count(*) from real_clinicians r where r.verification_status = 'verified' and not public.has_active_licence(r.id)),
    'eligible', (select count(*) from eligible),
    'available', (select count(*) from available),
    'licences_awaiting_review', (select count(*) from licenses l where l.reviewed_at is null and l.profile_id in (select id from real_ids)),
    'eligible_by_state', coalesce((
      select jsonb_object_agg(st, n) from (
        select upper(trim(l.state)) st, count(distinct l.profile_id) n
        from licenses l join eligible e on e.id = l.profile_id
        where l.status = 'active' and l.reviewed_at is not null and (l.expiration_date is null or l.expiration_date >= current_date)
        group by 1
      ) s
    ), '{}'::jsonb),
    'referrals_30d', (select count(*) from ref),
    'referrals_answered_30d', (select count(*) from ref where first_reply is not null),
    'referral_median_hours_to_reply', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from first_reply - created_at)) / 3600.0)::numeric, 1)
      from ref where first_reply is not null
    ),
    'cover_requests_30d', (select count(*) from cov),
    'cover_answered_30d', (select count(*) from cov where status <> 'sent'),
    'cover_accepted_30d', (select count(*) from cov where status = 'accepted'),
    'cover_median_hours_to_reply', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from responded_at - sent_at)) / 3600.0)::numeric, 1)
      from cov where responded_at is not null and sent_at is not null
    ),
    'invitations_30d', (select count(*) from inv),
    'invitations_accepted_30d', (select count(*) from inv where status = 'accepted'),
    'consults_30d', (select count(*) from con),
    'consults_answered_30d', (select count(*) from con where answered)
  ) into result;
  return result;
end;
$$;
revoke execute on function public.admin_network_metrics() from public, anon;
grant execute on function public.admin_network_metrics() to authenticated;

-- Blocked members are hidden from each other everywhere, so Settings gets
-- their names from here (only the blocker's own list).
create or replace function public.my_blocked_members()
returns table(id uuid, full_name text, credential_prefix text, blocked_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $$
  select p.id, p.full_name, p.credential_prefix, b.created_at
  from blocked_members b join profiles p on p.id = b.blocked_profile_id
  where b.profile_id = auth.uid()
  order by b.created_at desc;
$$;
revoke execute on function public.my_blocked_members() from public, anon;
grant execute on function public.my_blocked_members() to authenticated;
