-- Trusted colleagues are chosen, not negotiated (Nick, 10 Oct). A member
-- adds someone as a trusted colleague in one step, like the colleagues
-- they'd work alongside in a group practice; the other person is told once
-- and can add them back. "Worked with before" still builds itself, and
-- PsyAlliance suggests the rest. Saved clinicians are retired.
--
-- trusted_colleagues(profile_id, colleague_id) means "profile_id trusts
-- colleague_id". The older mutual `connections` rows (seeded sandbox
-- network, personal invitations) keep working: an accepted connection
-- writes both directions here.

create table if not exists public.trusted_colleagues (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  colleague_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, colleague_id),
  constraint trusted_not_self check (profile_id <> colleague_id)
);
create index if not exists idx_trusted_colleagues_colleague on public.trusted_colleagues (colleague_id);

alter table public.trusted_colleagues enable row level security;

create policy "see your trusted colleagues and who trusts you" on public.trusted_colleagues
  for select using ((select auth.uid()) = profile_id or (select auth.uid()) = colleague_id);
create policy "add to your own trusted colleagues" on public.trusted_colleagues
  for insert with check ((select auth.uid()) = profile_id);
create policy "remove from your own trusted colleagues" on public.trusted_colleagues
  for delete using ((select auth.uid()) = profile_id);

grant select, insert, delete on public.trusted_colleagues to authenticated;

-- Only a network member can add, and only someone they can see.
create or replace function public.guard_trusted_colleague()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or auth.uid() <> new.profile_id
     or current_setting('pa.trust_sync', true) = 'on'
     or current_setting('pa.invite_activation', true) = 'on'
     or current_setting('pa.seeding', true) = 'on' then
    return new;
  end if;
  if not private.is_network_member(new.profile_id) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can add trusted colleagues.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(new.colleague_id) or not private.can_see_profile(new.colleague_id)
     or public.is_blocked_between(new.profile_id, new.colleague_id) then
    raise exception 'You can''t add this member.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger guard_trusted_colleague
  before insert on public.trusted_colleagues
  for each row execute function public.guard_trusted_colleague();

-- Accepted connections (seeded networks, invitations) are trust both ways;
-- a request still waiting is trust from the person who asked.
create or replace function private.sync_trusted_from_connection()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('pa.trust_sync', 'on', true);
  if tg_op = 'DELETE' then
    if old.status = 'accepted' then
      delete from trusted_colleagues
      where (profile_id = old.requester_id and colleague_id = old.addressee_id)
         or (profile_id = old.addressee_id and colleague_id = old.requester_id);
    elsif old.status = 'pending' then
      delete from trusted_colleagues where profile_id = old.requester_id and colleague_id = old.addressee_id;
    end if;
  elsif new.tier = 'trusted_colleague' and new.status = 'accepted' then
    insert into trusted_colleagues (profile_id, colleague_id)
    values (new.requester_id, new.addressee_id), (new.addressee_id, new.requester_id)
    on conflict do nothing;
  elsif new.tier = 'trusted_colleague' and new.status = 'pending' then
    -- A request still waiting reads as the requester having added them.
    insert into trusted_colleagues (profile_id, colleague_id)
    values (new.requester_id, new.addressee_id)
    on conflict do nothing;
  end if;
  perform set_config('pa.trust_sync', '', true);
  return null;
end;
$$;

create or replace trigger sync_trusted_from_connection
  after insert or update or delete on public.connections
  for each row execute function private.sync_trusted_from_connection();

-- Existing accepted connections become trust both ways; a request still
-- waiting becomes trust from the person who asked.
insert into public.trusted_colleagues (profile_id, colleague_id, created_at)
select requester_id, addressee_id, coalesce(responded_at, created_at) from public.connections
where status = 'accepted' and tier = 'trusted_colleague'
union all
select addressee_id, requester_id, coalesce(responded_at, created_at) from public.connections
where status = 'accepted' and tier = 'trusted_colleague'
union all
select requester_id, addressee_id, created_at from public.connections
where status = 'pending' and tier = 'trusted_colleague'
on conflict do nothing;

-- A referral or consult sent to "your trusted colleagues" reaches the
-- people the author chose.
alter policy "referral requests are visible per their chosen audience" on public.referral_requests
  using (
    ((select auth.uid()) = requesting_profile_id)
    or (
      (status = any (array['open'::referral_status, 'sent'::referral_status, 'connected'::referral_status, 'handoff'::referral_status]))
      and (select private.can_view_network(auth.uid()))
      and private.in_viewer_partition(requesting_profile_id)
      and (not is_blocked_between((select auth.uid()), requesting_profile_id))
      and (
        ((audience_type = any (array['wider_network'::text, 'suggested'::text]))
          and (private.is_admin_user((select auth.uid()))
            or private.licensed_for((select auth.uid()), state, (coalesce(modality, 'either'::text) = any (array['virtual'::text, 'either'::text, 'telehealth'::text])))))
        or ((audience_type = 'selected'::text) and ((select auth.uid()) = any (audience_profile_ids)))
        or ((audience_type = 'trusted'::text)
          and exists (select 1 from trusted_colleagues t where t.profile_id = referral_requests.requesting_profile_id and t.colleague_id = (select auth.uid())))
      )
    )
  );

alter policy "consultations are visible per their chosen audience" on public.consultations
  using (
    (status <> all (array['draft'::text, 'removed'::text]))
    and (select private.can_view_network(auth.uid()))
    and private.in_viewer_partition(author_profile_id)
    and (not is_blocked_between((select auth.uid()), author_profile_id))
    and (
      (audience_type = 'wider_network'::text)
      or ((audience_type = 'selected'::text) and ((select auth.uid()) = any (audience_profile_ids)))
      or ((audience_type = 'trusted'::text)
        and exists (select 1 from trusted_colleagues t where t.profile_id = consultations.author_profile_id and t.colleague_id = (select auth.uid())))
      or ((group_id is not null) and private.is_consultation_group_member(group_id, (select auth.uid())))
    )
  );

-- Resetting a sandbox clears the guest's trusted colleagues too.
CREATE OR REPLACE FUNCTION private.clear_demo_viewer(p_viewer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from consultations where group_id in (select id from private.demo_rows where tbl = 'consultation_groups' and owner = p_viewer);
  delete from consultation_groups where id in (select id from private.demo_rows where tbl = 'consultation_groups' and owner = p_viewer);
  delete from conversations where id in (select id from private.demo_rows where tbl = 'conversations' and owner = p_viewer);
  delete from referral_requests where id in (select id from private.demo_rows where tbl = 'referral_requests' and owner = p_viewer);
  delete from coverage_plans where id in (select id from private.demo_rows where tbl = 'coverage_plans' and owner = p_viewer);
  delete from consultations where id in (select id from private.demo_rows where tbl = 'consultations' and owner = p_viewer);
  delete from notification_events where id in (select id from private.demo_rows where tbl = 'notification_events' and owner = p_viewer);
  delete from private.demo_rows where owner = p_viewer;
  delete from referral_requests where requesting_profile_id = p_viewer;
  delete from coverage_plans where profile_id = p_viewer;
  delete from consultations where author_profile_id = p_viewer;
  delete from consultation_groups where created_by = p_viewer;
  delete from conversations where id in (select conversation_id from conversation_participants where profile_id = p_viewer);
  delete from notification_events where actor_profile_id = p_viewer;
  delete from notification_deliveries where recipient_profile_id = p_viewer;
  delete from connections where p_viewer in (requester_id, addressee_id);
  delete from saved_clinicians where profile_id = p_viewer;
  delete from trusted_colleagues where p_viewer in (profile_id, colleague_id);
  delete from consult_tag_follows where profile_id = p_viewer;
  delete from consultation_group_members where profile_id = p_viewer;
  delete from professional_events where p_viewer in (actor_profile_id, related_profile_id, subject_profile_id);
end;
$function$;

-- The sandbox story's colleague who "invites you to her trusted circle"
-- now adds you as a trusted colleague.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'sandbox_story_event';
  if d is not null and position('invited you to their trusted circle' in d) > 0 then
    d := replace(d, '''invited you to their trusted circle''', '''added you as a trusted colleague''');
    d := replace(d, '''Imani Brooks invited you to her trusted circle''', '''Imani Brooks added you as a trusted colleague''');
    d := replace(d, '''Trusted colleagues come first in each other''''s matches.''', '''You now come first in her matches. Add her back to do the same.''');
    d := replace(d, '-- An invitation to a colleague''s trusted circle.', '-- A colleague adds the guest as a trusted colleague.');
    execute d;
  end if;
end $$;
