-- 0104: personal invitation links (Nick, 8 Oct). Every member has one link
-- that names them. A colleague who joins through it, or a member who opens
-- it and accepts, is put in the inviter's trusted circle automatically, and
-- the inviter in theirs. The connection is made once both are in the network
-- (verified, with a reviewed license in an open state); until then it waits.
-- Applied to both projects.

create table if not exists public.member_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  inviter uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists member_invites_one_active on public.member_invites (inviter) where revoked_at is null;
alter table public.member_invites enable row level security;
create policy "see your own invitation link" on public.member_invites for select to authenticated using (inviter = (select auth.uid()));

create table if not exists public.member_invite_uses (
  id bigint generated always as identity primary key,
  token text not null references public.member_invites(token) on delete cascade,
  inviter uuid not null references public.profiles(id) on delete cascade,
  invitee uuid not null references auth.users(id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  unique (inviter, invitee),
  check (inviter <> invitee)
);
create index if not exists member_invite_uses_waiting on public.member_invite_uses (invitee) where connected_at is null;
alter table public.member_invite_uses enable row level security;
create policy "see invitations you sent or used" on public.member_invite_uses for select to authenticated
  using (inviter = (select auth.uid()) or invitee = (select auth.uid()));

-- Connections made by an accepted invitation skip the "both verified to
-- invite" rule, because they are only made once both are in the network.
do $$ declare d text; begin
  select pg_get_functiondef('public.guard_connection_eligibility'::regproc) into d;
  if position('pa.invite_activation' in d) = 0 then
    execute replace(d, 'begin
  if auth.uid() is null then
    return new;
  end if;', 'begin
  if auth.uid() is null or current_setting(''pa.invite_activation'', true) = ''on'' then
    return new;
  end if;');
  end if;
end $$;

-- Connect every accepted invitation involving this person whose two people
-- are now both in the network. Safe to run any number of times.
create or replace function private.activate_member_invites(p_uid uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare u record; n int := 0;
begin
  if p_uid is null then return 0; end if;
  for u in
    select * from member_invite_uses
    where connected_at is null and (invitee = p_uid or inviter = p_uid)
    for update skip locked
  loop
    continue when not (private.is_network_member(u.inviter) and private.is_network_member(u.invitee));
    continue when (select is_demo from profiles where id = u.inviter) is distinct from (select is_demo from profiles where id = u.invitee);
    continue when public.is_blocked_between(u.inviter, u.invitee);
    perform set_config('pa.invite_activation', 'on', true);
    if exists (select 1 from connections c where (c.requester_id = u.inviter and c.addressee_id = u.invitee) or (c.requester_id = u.invitee and c.addressee_id = u.inviter)) then
      update connections set tier = 'trusted_colleague', status = 'accepted', responded_at = coalesce(responded_at, now())
      where (requester_id = u.inviter and addressee_id = u.invitee) or (requester_id = u.invitee and addressee_id = u.inviter);
    else
      insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)
      values (u.inviter, u.invitee, 'trusted_colleague', 'accepted', now(), now());
    end if;
    perform set_config('pa.invite_activation', '', true);
    update member_invite_uses set connected_at = now() where id = u.id;
    perform private.notify_member(u.inviter, u.invitee, 'accepted your invitation and is now in your trusted circle', '/dashboard/people/' || u.invitee);
    perform private.notify_member(u.invitee, u.inviter, 'is now in your trusted circle', '/dashboard/people/' || u.inviter);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- The member's own link, made on first use. Real clinician accounts only:
-- the sandbox can't send invitations.
create or replace function public.my_invite_link()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare me uuid := auth.uid(); t text; ok boolean;
begin
  if me is null then return null; end if;
  select p.account_kind = 'clinician' and not p.is_demo and not coalesce(p.demo_view, false) and p.account_status = 'active'
    into ok from profiles p where p.id = me;
  if not coalesce(ok, false) then return null; end if;
  select token into t from member_invites where inviter = me and revoked_at is null;
  if t is null then
    insert into member_invites (inviter) values (me) returning token into t;
  end if;
  return t;
end;
$function$;

-- Who an invitation link is from, for its landing page (anyone with the
-- link can see this; nothing else).
create or replace function public.member_invite_info(p_token text)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object('full_name', p.full_name, 'credential_prefix', p.credential_prefix, 'qualification_level', p.qualification_level,
    'city', p.primary_practice_city, 'state', p.primary_state)
  from member_invites mi join profiles p on p.id = mi.inviter
  where mi.token = p_token and mi.revoked_at is null and p.account_status = 'active' and not p.is_demo;
$function$;

-- A signed-in member accepts an invitation link.
create or replace function public.accept_member_invite(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare me uuid := auth.uid(); inv record; mine record;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select mi.token, mi.inviter into inv from member_invites mi join profiles p on p.id = mi.inviter
  where mi.token = p_token and mi.revoked_at is null and p.account_status = 'active' and not p.is_demo;
  if not found then
    raise exception 'This invitation link is no longer active. Ask your colleague for a new one.' using errcode = 'P0001';
  end if;
  if inv.inviter = me then
    return jsonb_build_object('self', true);
  end if;
  select is_demo, coalesce(demo_view, false) demo_view into mine from profiles where id = me;
  if coalesce(mine.is_demo, false) or coalesce(mine.demo_view, false) then
    raise exception 'Sandbox accounts can''t accept invitations.' using errcode = 'P0001';
  end if;
  insert into member_invite_uses (token, inviter, invitee) values (inv.token, inv.inviter, me)
  on conflict (inviter, invitee) do nothing;
  perform private.activate_member_invites(me);
  return jsonb_build_object('inviter', inv.inviter,
    'connected', exists (select 1 from member_invite_uses where inviter = inv.inviter and invitee = me and connected_at is not null));
end;
$function$;

-- For the inviter: who has used their link, and whether they're connected
-- yet. For the invitee: who they're waiting to be connected with.
create or replace function public.my_invitations()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.invitee, 'name', coalesce(p.full_name, au.raw_user_meta_data ->> 'full_name', 'A colleague'),
        'credential_prefix', p.credential_prefix, 'qualification_level', coalesce(p.qualification_level::text, au.raw_user_meta_data ->> 'qualification'),
        'joined', u.created_at, 'connected', u.connected_at is not null) order by u.created_at desc)
      from member_invite_uses u join auth.users au on au.id = u.invitee left join profiles p on p.id = u.invitee
      where u.inviter = auth.uid()), '[]'::jsonb),
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.inviter, 'name', p.full_name, 'credential_prefix', p.credential_prefix, 'qualification_level', p.qualification_level))
      from member_invite_uses u join profiles p on p.id = u.inviter
      where u.invitee = auth.uid() and u.connected_at is null), '[]'::jsonb)
  );
$function$;

-- Sign-up through a link: remember it with the new account (it survives
-- email confirmation and a change of device).
do $$ declare d text; begin
  select pg_get_functiondef('private.enforce_invitation'::regproc) into d;
  if position('member_invite_uses' in d) = 0 then
    execute replace(d, '  return new;
end;', '  if coalesce(new.raw_user_meta_data ->> ''connect'', '''') <> '''' then
    insert into member_invite_uses (token, inviter, invitee)
    select mi.token, mi.inviter, new.id from member_invites mi
    where mi.token = new.raw_user_meta_data ->> ''connect'' and mi.revoked_at is null
    on conflict do nothing;
  end if;
  return new;
end;');
  end if;
end $$;

-- Connect as soon as someone joins the network: a license is reviewed, an
-- account is verified, or a state opens.
create or replace function private.activate_invites_on_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare x uuid;
begin
  if tg_table_name = 'licenses' then
    perform private.activate_member_invites(new.profile_id);
  elsif tg_table_name = 'profiles' then
    perform private.activate_member_invites(new.id);
  else
    for x in select distinct invitee from member_invite_uses where connected_at is null loop
      perform private.activate_member_invites(x);
    end loop;
  end if;
  return null;
end;
$function$;

create trigger activate_invites_licence after update of reviewed_at on public.licenses
  for each row when (new.reviewed_at is not null and old.reviewed_at is null) execute function private.activate_invites_on_change();
create trigger activate_invites_profile after update of verification_status, account_status on public.profiles
  for each row when (new.verification_status = 'verified' and new.account_status = 'active') execute function private.activate_invites_on_change();
create trigger activate_invites_states after insert or update on public.open_states
  for each statement execute function private.activate_invites_on_change();
