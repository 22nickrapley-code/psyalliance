-- Launch audit, trust and privacy blockers.
--
-- 1. Operator accounts. An admin login is an operator, not a clinician:
--    never listed, matched, counted or queued for verification.
-- 2. One definition of "network member": a clinician account that is
--    verified, active and holds at least one reviewed, in-date licence
--    (demo accounts carry demo licences). Reading the network, publishing,
--    replying and outreach all require it. Pending accounts can still edit
--    their own profile, credentials and private drafts.
-- 3. Profiles. Other members see a deliberately limited projection. The
--    private columns (contact details, NPI, CAQH, malpractice, internal
--    flags) are readable only by the owner (my_profile) and admins
--    (admin_profiles), through column privileges, not app discipline.
-- 4. Demo and real accounts are partitioned in every network read and
--    write path, not only the directory.
-- 5. Notifications can't be used to send arbitrary email: only network
--    members raise events, only as themselves, only to members of their
--    own partition, and email links are always on-site.

-- 1. Operator accounts ----------------------------------------------------

alter table public.profiles add column if not exists account_kind text not null default 'clinician';
do $$ begin
  alter table public.profiles add constraint profiles_account_kind_check check (account_kind in ('clinician', 'operator'));
exception when duplicate_object then null; end $$;

-- Clinical fields are optional (operators have none). The app used to
-- default a missing qualification to PhD, which is how the admin login
-- ended up described as a PhD.
alter table public.profiles alter column qualification_level drop not null;

create or replace function public.protect_admin_controlled_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Service context (migrations, scheduled jobs). RLS already stops anon.
  if auth.uid() is null then
    return new;
  end if;
  if not private.is_admin_user((select auth.uid())) then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.is_admin := old.is_admin;
    new.account_status := old.account_status;
    new.is_demo := old.is_demo;
    new.account_kind := old.account_kind;
    -- Members may leave the demo view, never enter it.
    if new.demo_view and not old.demo_view then
      new.demo_view := old.demo_view;
    end if;
  end if;
  return new;
end;
$$;

-- New sign-ups can't make themselves admins, operators, verified or demo.
create or replace function public.protect_profile_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or private.is_admin_user((select auth.uid())) then
    return new;
  end if;
  new.verification_status := 'pending';
  new.verified_at := null;
  new.is_admin := false;
  new.account_status := 'active';
  new.is_demo := false;
  new.demo_view := false;
  new.account_kind := 'clinician';
  return new;
end;
$$;
revoke execute on function public.protect_profile_insert() from public, anon, authenticated;
drop trigger if exists protect_profile_insert on public.profiles;
create trigger protect_profile_insert before insert on public.profiles
  for each row execute function public.protect_profile_insert();

-- 2. Eligibility helpers --------------------------------------------------

create or replace function private.is_network_member(uid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce((
    select p.account_kind = 'clinician'
       and p.verification_status = 'verified'
       and p.account_status = 'active'
       -- demo accounts, and the demo view admins can switch on, act
       -- only inside the demo partition, so they don't need licences.
       and (p.is_demo or p.demo_view or public.has_active_licence(p.id))
    from profiles p where p.id = uid
  ), false);
$$;

create or replace function private.can_view_network(uid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select private.is_network_member(uid) or private.is_admin_user(uid);
$$;

create or replace function private.profile_is_demo(uid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce((select is_demo from profiles where id = uid), false);
$$;

-- A member counts as licensed for a need in a state if a reviewed,
-- in-date licence covers that state, or the need allows telehealth and
-- they take part in PSYPACT. A need with no state needs any licence.
create or replace function private.licensed_for(uid uuid, st text, telehealth boolean)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when private.profile_is_demo(uid) then true
    when st is null or trim(st) = '' then public.has_active_licence(uid)
    else exists (
      select 1 from licenses l
      where l.profile_id = uid
        and upper(trim(l.state)) = upper(trim(st))
        and l.status = 'active'
        and l.reviewed_at is not null
        and (l.expiration_date is null or l.expiration_date >= current_date)
    ) or (
      coalesce(telehealth, false)
      and public.has_active_licence(uid)
      and coalesce((select psypact_participating from profiles where id = uid), false)
    )
  end;
$$;

-- Can the signed-in viewer see this member's public profile projection?
create or replace function private.can_see_profile(target uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select target = auth.uid()
    or private.is_admin_user(auth.uid())
    or (
      private.can_view_network(auth.uid())
      and exists (
        select 1 from profiles p
        where p.id = target
          and p.account_status = 'active'
          and p.is_demo = public.viewer_is_demo()
          and (
            p.account_kind = 'operator'
            or (p.account_kind = 'clinician' and p.verification_status = 'verified')
          )
      )
      and not public.is_blocked_between(auth.uid(), target)
    );
$$;

-- Same partition as the viewer (demo accounts only ever meet demo accounts).
create or replace function private.in_viewer_partition(target uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select private.profile_is_demo(target) = public.viewer_is_demo();
$$;

revoke execute on function private.is_network_member(uuid) from public, anon;
revoke execute on function private.can_view_network(uuid) from public, anon;
revoke execute on function private.profile_is_demo(uuid) from public, anon;
revoke execute on function private.licensed_for(uuid, text, boolean) from public, anon;
revoke execute on function private.can_see_profile(uuid) from public, anon;
revoke execute on function private.in_viewer_partition(uuid) from public, anon;
grant execute on function private.is_network_member(uuid) to authenticated;
grant execute on function private.can_view_network(uuid) to authenticated;
grant execute on function private.profile_is_demo(uuid) to authenticated;
grant execute on function private.licensed_for(uuid, text, boolean) to authenticated;
grant execute on function private.can_see_profile(uuid) to authenticated;
grant execute on function private.in_viewer_partition(uuid) to authenticated;

-- The signed-in member's own eligibility, for the app to explain itself.
create or replace function public.my_network_status()
returns table(is_member boolean, can_view boolean, is_admin boolean, is_operator boolean, has_reviewed_licence boolean)
language sql
stable security definer
set search_path to 'public'
as $$
  select private.is_network_member(auth.uid()),
         private.can_view_network(auth.uid()),
         private.is_admin_user(auth.uid()),
         coalesce((select account_kind = 'operator' from profiles where id = auth.uid()), false),
         public.has_active_licence(auth.uid());
$$;
revoke execute on function public.my_network_status() from public, anon;
grant execute on function public.my_network_status() to authenticated;

-- 3. Profiles --------------------------------------------------------------

drop policy if exists "verified profiles are readable by any authenticated user" on public.profiles;
drop policy if exists "network members see verified colleagues" on public.profiles;
create policy "network members see verified colleagues" on public.profiles
  for select to authenticated
  using (private.can_see_profile(id));

-- Column privileges: the projection other members can read. Anything not
-- listed (contact details, NPI, CAQH, malpractice, cohort and discovery
-- flags, demo view) is private to the owner and admins, via the two
-- functions below.
revoke all on public.profiles from anon;
revoke select on public.profiles from authenticated;
grant select (
  id, full_name, credential_prefix, qualification_level, board_certified,
  primary_practice_city, states_qualified, primary_state, accepting_referrals,
  verification_status, verified_at, created_at, updated_at, is_admin,
  last_active_at, pronoun, practice_website, open_to_group_consultation,
  open_to_give_supervision, open_to_receive_supervision, psypact_participating,
  runs_private_practice, employed_by_group_practice, avatar_path,
  founding_member_since, referral_availability, coverage_availability,
  consultation_availability, availability_confirmed_at, account_status,
  is_demo, approx_spaces, availability_paused_until, bio, directory_visible,
  account_kind
) on public.profiles to authenticated;

create or replace function public.my_profile()
returns setof public.profiles
language sql
stable security definer
set search_path to 'public'
as $$
  select * from profiles where id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

create or replace function public.admin_profiles()
returns setof public.profiles
language sql
stable security definer
set search_path to 'public'
as $$
  select * from profiles where private.is_admin_user(auth.uid());
$$;
revoke execute on function public.admin_profiles() from public, anon;
grant execute on function public.admin_profiles() to authenticated;

-- The directory no longer carries contact details, and lists clinicians only.
drop view if exists public.public_directory;
create view public.public_directory with (security_invoker = true) as
  select p.id, p.full_name, p.credential_prefix, p.qualification_level, p.board_certified,
         p.primary_practice_city, p.primary_state, p.accepting_referrals,
         p.referral_availability, p.coverage_availability, p.consultation_availability,
         p.availability_confirmed_at, p.last_active_at, p.practice_website,
         p.open_to_group_consultation, p.open_to_give_supervision, p.open_to_receive_supervision,
         p.psypact_participating, p.avatar_path, lv.category, lv.value, plv.rank
  from profiles p
  join profile_lookup_values plv on plv.profile_id = p.id
  join lookup_values lv on lv.id = plv.lookup_value_id
  where p.verification_status = 'verified'
    and p.account_status = 'active'
    and p.account_kind = 'clinician'
    and p.directory_visible
    and p.is_demo = public.viewer_is_demo()
    and (p.is_demo or public.has_active_licence(p.id))
    and not public.is_blocked_between(auth.uid(), p.id);
revoke all on public.public_directory from anon;
grant select on public.public_directory to authenticated;

create or replace function public.network_licence_states()
returns table(profile_id uuid, states text[])
language sql
stable security definer
set search_path to 'public'
as $$
  select l.profile_id, array_agg(distinct upper(trim(l.state))) as states
  from licenses l
  join profiles p on p.id = l.profile_id
  where private.can_view_network(auth.uid())
    and l.status = 'active'
    and l.reviewed_at is not null
    and (l.expiration_date is null or l.expiration_date >= current_date)
    and p.verification_status = 'verified'
    and p.account_status = 'active'
    and p.account_kind = 'clinician'
    and p.directory_visible
    and p.is_demo = public.viewer_is_demo()
    and not public.is_blocked_between(auth.uid(), p.id)
  group by l.profile_id;
$$;

-- Practice facts and weekly availability follow profile visibility.
drop policy if exists "profile lookup values are readable for your own or verified pro" on public.profile_lookup_values;
create policy "profile lookup values follow profile visibility" on public.profile_lookup_values
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.can_see_profile(profile_id));

drop policy if exists "verified profiles' availability is readable by any authenticate" on public.profile_availability;
create policy "availability follows profile visibility" on public.profile_availability
  for select to authenticated
  using (private.can_see_profile(profile_id));

-- 4. Network reads and writes ----------------------------------------------

-- Consult
drop policy if exists "consultations are visible per their chosen audience" on public.consultations;
create policy "consultations are visible per their chosen audience" on public.consultations
  for select to authenticated
  using (
    status <> all (array['draft', 'removed'])
    and (select private.can_view_network(auth.uid()))
    and private.in_viewer_partition(author_profile_id)
    and not public.is_blocked_between((select auth.uid()), author_profile_id)
    and (
      audience_type = 'wider_network'
      or (audience_type = 'selected' and (select auth.uid()) = any (audience_profile_ids))
      or (audience_type = 'trusted' and exists (
        select 1 from connections c
        where c.tier = 'trusted_colleague' and c.status = 'accepted'
          and ((c.requester_id = consultations.author_profile_id and c.addressee_id = (select auth.uid()))
            or (c.addressee_id = consultations.author_profile_id and c.requester_id = (select auth.uid())))
      ))
      or (group_id is not null and private.is_consultation_group_member(group_id, (select auth.uid())))
    )
  );

create or replace function public.guard_consultation_publish()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status <> 'draft' and (tg_op = 'INSERT' or old.status = 'draft') then
    if not private.is_network_member(new.author_profile_id) then
      raise exception 'Your account needs to be verified, with a reviewed licence, before you can post to the network.' using errcode = 'P0001';
    end if;
    if new.group_id is not null and not exists (
      select 1 from consultation_groups g where g.id = new.group_id and g.created_by = new.author_profile_id
    ) and not private.is_consultation_group_member(new.group_id, new.author_profile_id) then
      raise exception 'Only members of this group can post to it.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_consultation_publish() from public, anon, authenticated;
drop trigger if exists guard_consultation_publish on public.consultations;
create trigger guard_consultation_publish before insert or update of status on public.consultations
  for each row execute function public.guard_consultation_publish();

drop policy if exists "respond to a consultation you can see" on public.consultation_responses;
create policy "respond to a consultation you can see" on public.consultation_responses
  for insert to authenticated
  with check (
    (select auth.uid()) = responder_profile_id
    and (select private.is_network_member(auth.uid()))
    and exists (select 1 from consultations c where c.id = consultation_responses.consultation_id and c.status <> 'draft')
  );

-- Refer
drop policy if exists "referral requests are visible per their chosen audience" on public.referral_requests;
create policy "referral requests are visible per their chosen audience" on public.referral_requests
  for select to authenticated
  using (
    (select auth.uid()) = requesting_profile_id
    or (
      status = any (array['open', 'sent', 'connected', 'handoff']::referral_status[])
      and (select private.can_view_network(auth.uid()))
      and private.in_viewer_partition(requesting_profile_id)
      and not public.is_blocked_between((select auth.uid()), requesting_profile_id)
      and (
        (audience_type = any (array['wider_network', 'suggested'])
          and (private.is_admin_user((select auth.uid()))
            or private.licensed_for((select auth.uid()), state, coalesce(modality, 'either') in ('virtual', 'either', 'telehealth'))))
        or (audience_type = 'selected' and (select auth.uid()) = any (audience_profile_ids))
        or (audience_type = 'trusted' and exists (
          select 1 from connections c
          where c.tier = 'trusted_colleague' and c.status = 'accepted'
            and ((c.requester_id = referral_requests.requesting_profile_id and c.addressee_id = (select auth.uid()))
              or (c.addressee_id = referral_requests.requesting_profile_id and c.requester_id = (select auth.uid())))
        ))
      )
    )
  );

drop policy if exists "create your own referral requests" on public.referral_requests;
create policy "create your own referral requests" on public.referral_requests
  for insert to authenticated
  with check ((select auth.uid()) = requesting_profile_id and (select private.is_network_member(auth.uid())));

create or replace function public.guard_referral_response()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if auth.uid() is null or auth.uid() <> new.responding_profile_id then
    return new;
  end if;
  select * into r from referral_requests where id = new.referral_request_id;
  if not private.is_network_member(new.responding_profile_id) then
    raise exception 'Your account needs to be verified, with a reviewed licence, before you can reply to referrals.' using errcode = 'P0001';
  end if;
  if r.id is not null and not private.licensed_for(new.responding_profile_id, r.state, coalesce(r.modality, 'either') in ('virtual', 'either', 'telehealth')) then
    raise exception 'You need a reviewed licence in % to take this referral.' , r.state using errcode = 'P0001';
  end if;
  if r.id is not null and private.profile_is_demo(r.requesting_profile_id) <> public.viewer_is_demo() then
    raise exception 'That referral isn''t available.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_referral_response() from public, anon, authenticated;
drop trigger if exists guard_referral_response on public.referral_responses;
create trigger guard_referral_response before insert on public.referral_responses
  for each row execute function public.guard_referral_response();

-- Cover: outreach goes only to eligible, licensed colleagues in the same
-- partition, from an eligible owner. Replies need eligibility too.
create or replace function public.guard_cover_outreach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  owner uuid;
  st text;
  tele boolean;
begin
  if tg_op = 'INSERT' then
    select pl.profile_id, pl.jurisdiction_state, coalesce(c.modality, 'either') in ('virtual', 'either')
      into owner, st, tele
    from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
    where c.id = new.coverage_plan_case_id;
    if not private.is_network_member(owner) then
      raise exception 'Your account needs to be verified, with a reviewed licence, before you can ask colleagues for cover.' using errcode = 'P0001';
    end if;
    if not private.is_network_member(new.requested_profile_id)
       or private.profile_is_demo(new.requested_profile_id) <> private.profile_is_demo(owner) and not (
         -- demo view: a real account looking at the demo network
         private.profile_is_demo(new.requested_profile_id) and coalesce((select demo_view from profiles where id = owner), false)
       ) then
      raise exception 'That colleague can''t be asked for cover.' using errcode = 'P0001';
    end if;
    if public.is_blocked_between(owner, new.requested_profile_id) then
      raise exception 'That colleague can''t be asked for cover.' using errcode = 'P0001';
    end if;
    if not private.licensed_for(new.requested_profile_id, st, tele) then
      raise exception 'That colleague has no reviewed licence for %.', coalesce(st, 'this state') using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and auth.uid() is not null and auth.uid() = new.requested_profile_id
        and new.status is distinct from old.status and new.status in ('accepted', 'discussing') then
    if not private.is_network_member(new.requested_profile_id) then
      raise exception 'Your account needs to be verified, with a reviewed licence, before you can take on cover.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_cover_outreach() from public, anon, authenticated;
drop trigger if exists guard_cover_outreach on public.coverage_requests;
create trigger guard_cover_outreach before insert or update of status on public.coverage_requests
  for each row execute function public.guard_cover_outreach();

-- Connections (trusted colleagues)
create or replace function public.guard_connection_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not private.is_network_member(new.requester_id) then
      raise exception 'Your account needs to be verified, with a reviewed licence, before you can invite colleagues.' using errcode = 'P0001';
    end if;
    if not private.is_network_member(new.addressee_id) or not private.in_viewer_partition(new.addressee_id) then
      raise exception 'You can''t invite this member.' using errcode = 'P0001';
    end if;
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' and auth.uid() = new.addressee_id then
    if not private.is_network_member(new.addressee_id) then
      raise exception 'Your account needs to be verified before you can accept invitations.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_connection_eligibility() from public, anon, authenticated;
drop trigger if exists guard_connection_eligibility on public.connections;
create trigger guard_connection_eligibility before insert or update of status on public.connections
  for each row execute function public.guard_connection_eligibility();

-- Messages: members message members; admins may message anyone (for
-- verification questions). Pending accounts can only reply to an admin.
create or replace function public.guard_conversation_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare creator uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_table_name = 'conversation_participants' then
    select created_by into creator from conversations where id = new.conversation_id;
    if new.profile_id = creator then
      return new;
    end if;
    if private.is_admin_user(creator) then
      return new;
    end if;
    if not private.is_network_member(creator) then
      raise exception 'Your account needs to be verified, with a reviewed licence, before you can message colleagues.' using errcode = 'P0001';
    end if;
    if not (private.is_network_member(new.profile_id) or private.is_admin_user(new.profile_id))
       or not private.in_viewer_partition(new.profile_id) then
      raise exception 'You can''t message this member.' using errcode = 'P0001';
    end if;
  else
    if private.can_view_network(new.author_id) then
      return new;
    end if;
    -- A pending member may reply in a conversation an admin started.
    if exists (
      select 1 from conversations c where c.id = new.conversation_id and private.is_admin_user(c.created_by)
    ) then
      return new;
    end if;
    raise exception 'Your account needs to be verified, with a reviewed licence, before you can message colleagues.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_conversation_eligibility() from public, anon, authenticated;
drop trigger if exists guard_conversation_participant_eligibility on public.conversation_participants;
create trigger guard_conversation_participant_eligibility before insert on public.conversation_participants
  for each row execute function public.guard_conversation_eligibility();
drop trigger if exists guard_conversation_message_eligibility on public.conversation_messages;
create trigger guard_conversation_message_eligibility before insert on public.conversation_messages
  for each row execute function public.guard_conversation_eligibility();

-- Consultation groups: invitees must be eligible members of the same
-- partition; joining needs eligibility.
create or replace function public.guard_group_membership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or new.profile_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role = 'creator' and new.profile_id = auth.uid() then
      return new;
    end if;
    if not private.is_network_member(auth.uid()) then
      raise exception 'Your account needs to be verified, with a reviewed licence, before you can invite colleagues.' using errcode = 'P0001';
    end if;
    if not private.is_network_member(new.profile_id) or not private.in_viewer_partition(new.profile_id)
       or public.is_blocked_between(auth.uid(), new.profile_id) then
      raise exception 'You can''t invite this member.' using errcode = 'P0001';
    end if;
  elsif new.status = 'joined' and old.status is distinct from 'joined' and auth.uid() = new.profile_id then
    if not private.is_network_member(new.profile_id) then
      raise exception 'Your account needs to be verified before you can join a group.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_group_membership() from public, anon, authenticated;
drop trigger if exists guard_group_membership on public.consultation_group_members;
create trigger guard_group_membership before insert or update of status on public.consultation_group_members
  for each row execute function public.guard_group_membership();

-- Track record: aggregate counts only. Individual professional events are
-- private to the people in them (and admins).
drop policy if exists "professional events are readable network-wide" on public.professional_events;
create policy "professional events are readable by the people in them" on public.professional_events
  for select to authenticated
  using (
    (select auth.uid()) in (actor_profile_id, subject_profile_id, related_profile_id)
    or private.is_admin_user((select auth.uid()))
  );

create or replace function public.member_track_record(target uuid)
returns table(covers_completed bigint, median_response_hours numeric)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    (select count(*) from professional_events e where e.event_type = 'coverage_completed' and e.related_profile_id = target),
    (select round((percentile_cont(0.5) within group (order by x.response_time_seconds) / 3600.0)::numeric, 1)
       from (select response_time_seconds from professional_events e
             where e.actor_profile_id = target and e.response_time_seconds is not null
             order by e.created_at desc limit 50) x)
  where private.can_see_profile(target);
$$;
revoke execute on function public.member_track_record(uuid) from public, anon;
grant execute on function public.member_track_record(uuid) to authenticated;

drop policy if exists "endorsements_select_all" on public.endorsements;
create policy "endorsements follow profile visibility" on public.endorsements
  for select to authenticated
  using (endorser_id = (select auth.uid()) or (private.can_see_profile(endorsee_id) and private.can_see_profile(endorser_id)));

-- Legacy Town Hall, planner, activity and news tables are no longer used by
-- the app. Members lose access; admins keep read access for the record.
drop policy if exists "verified users can log their own activity events" on public.activity_events;
drop policy if exists "verified users can read activity events" on public.activity_events;
drop policy if exists "verified users can read news cache" on public.news_cache;
drop policy if exists "verified users can refresh news cache" on public.news_cache;
drop policy if exists "verified users can update news cache" on public.news_cache;
drop policy if exists "verified users can read channels" on public.town_hall_channels;
drop policy if exists "verified users can post town hall messages" on public.town_hall_messages;
drop policy if exists "verified users can read town hall messages" on public.town_hall_messages;
drop policy if exists "verified users can react" on public.town_hall_reactions;
drop policy if exists "verified users can read reactions" on public.town_hall_reactions;
create policy "admins read town hall channels" on public.town_hall_channels for select to authenticated using (private.is_admin_user((select auth.uid())));
create policy "admins read town hall messages" on public.town_hall_messages for select to authenticated using (private.is_admin_user((select auth.uid())));

-- 5. Notifications -----------------------------------------------------------

drop policy if exists "system/service inserts notification events" on public.notification_events;
create policy "members raise events as themselves" on public.notification_events
  for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid())
    and (select private.can_view_network(auth.uid()))
    and event_type = any (array[
      'coverage_request', 'coverage_response', 'coverage_confirmed',
      'referral_sent', 'referral_response', 'referral_connected',
      'consultation_invite', 'consultation_response',
      'trusted_invitation_sent', 'trusted_invitation_accepted', 'message_received'
    ])
    and (deep_link is null or deep_link ~ '^/[A-Za-z0-9]')
  );

-- (A definer check: the events policy reads deliveries, so a subquery
-- here would recurse.)
create or replace function private.is_own_event(ev bigint)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from notification_events e where e.id = ev and e.actor_profile_id = auth.uid());
$$;
revoke execute on function private.is_own_event(bigint) from public, anon;
grant execute on function private.is_own_event(bigint) to authenticated;

drop policy if exists "system/service creates deliveries" on public.notification_deliveries;
create policy "members deliver their own events within their partition" on public.notification_deliveries
  for insert to authenticated
  with check (
    private.is_own_event(notification_event_id)
    and channel in ('in_app', 'email')
    and status in ('sent', 'pending', 'suppressed_dedup')
    and private.in_viewer_partition(recipient_profile_id)
  );

-- Email links are always on this site, whatever was stored.
create or replace function private.safe_deep_link(p text)
returns text
language sql
immutable
as $$
  select case when p ~ '^/[A-Za-z0-9]' then p else '/dashboard' end;
$$;
revoke execute on function private.safe_deep_link(text) from public, anon, authenticated;

do $$
declare def text;
begin
  def := pg_get_functiondef('private.render_email'::regproc);
  def := replace(def, 'coalesce(e.deep_link, ''/dashboard'')', 'private.safe_deep_link(e.deep_link)');
  def := replace(def, 'site || (item ->> ''link'')', 'site || private.safe_deep_link(item ->> ''link'')');
  execute def;
end $$;

-- The admin login is an operator: no clinical claims, never listed.
update public.profiles
set account_kind = 'operator',
    full_name = regexp_replace(full_name, '\s*\(Admin\)\s*$', ''),
    credential_prefix = null,
    qualification_level = null,
    board_certified = false,
    directory_visible = false,
    accepting_referrals = false
where is_admin and not is_demo and account_kind = 'clinician'
  and not public.has_active_licence(id);
