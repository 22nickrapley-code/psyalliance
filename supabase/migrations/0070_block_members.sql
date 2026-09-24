-- Block (Product Spec v1, Settings > Privacy): stronger than Exclude. A
-- blocked member can't message you, invite you or see you in the
-- directory or suggestions, and you don't see them. Private: they're
-- never told.

create table if not exists public.blocked_members (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, blocked_profile_id),
  check (profile_id <> blocked_profile_id)
);
alter table public.blocked_members enable row level security;
drop policy if exists "own blocks only" on public.blocked_members;
create policy "own blocks only" on public.blocked_members
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);
create index if not exists blocked_members_blocked_idx on public.blocked_members(blocked_profile_id);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from blocked_members
    where (profile_id = a and blocked_profile_id = b)
       or (profile_id = b and blocked_profile_id = a)
  );
$$;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Hide blocked members from each other in the directory and matching.
create or replace view public.public_directory with (security_invoker = true) as
 SELECT p.id,
    p.full_name,
    p.credential_prefix,
    p.qualification_level,
    p.board_certified,
    p.primary_practice_city,
    p.primary_state,
    p.accepting_referrals,
    p.referral_availability,
    p.coverage_availability,
    p.consultation_availability,
    p.availability_confirmed_at,
    p.last_active_at,
    p.practice_website,
    p.contact_phone,
    p.contact_email,
    p.open_to_group_consultation,
    p.open_to_give_supervision,
    p.open_to_receive_supervision,
    p.psypact_participating,
    p.avatar_path,
    lv.category,
    lv.value,
    plv.rank
   FROM profiles p
     JOIN profile_lookup_values plv ON plv.profile_id = p.id
     JOIN lookup_values lv ON lv.id = plv.lookup_value_id
  WHERE p.verification_status = 'verified'::verification_status
    AND p.account_status = 'active'
    AND p.directory_visible
    AND p.is_demo = viewer_is_demo()
    AND (p.is_demo OR has_active_licence(p.id))
    AND NOT is_blocked_between(auth.uid(), p.id);

create or replace function public.network_licence_states()
returns table(profile_id uuid, states text[])
language sql
stable security definer
set search_path to 'public'
as $$
  select l.profile_id, array_agg(distinct upper(trim(l.state))) as states
  from licenses l
  join profiles p on p.id = l.profile_id
  where l.status = 'active'
    and l.reviewed_at is not null
    and (l.expiration_date is null or l.expiration_date >= current_date)
    and p.verification_status = 'verified'
    and p.account_status = 'active'
    and p.directory_visible
    and p.is_demo = public.viewer_is_demo()
    and not public.is_blocked_between(auth.uid(), p.id)
  group by l.profile_id;
$$;

-- Enforce at write time: no new messages, conversations or invitations
-- across a block, whichever screen they come from.
create or replace function public.guard_block_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.profile_id <> new.author_id
      and public.is_blocked_between(new.author_id, cp.profile_id)
  ) then
    raise exception 'You can''t message this member.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists guard_block_message on public.conversation_messages;
create trigger guard_block_message before insert on public.conversation_messages
  for each row execute function public.guard_block_message();

create or replace function public.guard_block_participant()
returns trigger language plpgsql security definer set search_path = public as $$
declare creator uuid;
begin
  select created_by into creator from conversations where id = new.conversation_id;
  if creator is not null and creator <> new.profile_id and public.is_blocked_between(creator, new.profile_id) then
    raise exception 'You can''t message this member.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists guard_block_participant on public.conversation_participants;
create trigger guard_block_participant before insert on public.conversation_participants
  for each row execute function public.guard_block_participant();

create or replace function public.guard_block_connection()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_between(new.requester_id, new.addressee_id) then
    raise exception 'You can''t invite this member.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists guard_block_connection on public.connections;
create trigger guard_block_connection before insert on public.connections
  for each row execute function public.guard_block_connection();
