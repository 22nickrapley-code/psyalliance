-- 0102: open sign-up, state by state (Nick, 7 Oct). Anyone can create an
-- account; a person still verifies every license; the network opens in a
-- state only when Nick switches it on (New York and Massachusetts first).
-- Verified members licensed only in states that aren't open yet keep the
-- Library, the sandbox and their profile, and see their place in that
-- state's queue. Applied to both projects; sign-up opens on the real one.

-- 1. States that are open. Readable by anyone (the site says where it's open).
create table if not exists public.open_states (
  state text primary key check (state ~ '^[A-Z]{2}$'),
  open boolean not null default true,
  changed_at timestamptz not null default now()
);
alter table public.open_states enable row level security;
create policy "open states are public" on public.open_states for select to anon, authenticated using (true);
insert into public.open_states (state, open) values ('NY', true), ('MA', true) on conflict (state) do nothing;

create or replace function private.has_open_licence(uid uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from licenses l
    join open_states o on o.state = upper(trim(l.state)) and o.open
    where l.profile_id = uid
      and l.status = 'active'
      and l.reviewed_at is not null
      and (l.expiration_date is null or l.expiration_date >= current_date)
  );
$function$;

-- 2. A network member needs a reviewed license in an open state. Every
-- network read goes through these, so this one change gates the network.
do $$ declare d text; begin
  select pg_get_functiondef('private.is_network_member'::regproc) into d;
  if position('public.has_active_licence(p.id)' in d) > 0 then
    execute replace(d, 'public.has_active_licence(p.id)', 'private.has_open_licence(p.id)');
  end if;

  select pg_get_functiondef('private.visible_members'::regproc) into d;
  if position('has_open_licence' in d) = 0 then
    execute replace(d, 'and p.directory_visible and p.is_demo = me.demo', 'and p.directory_visible and p.is_demo = me.demo and (p.is_demo or private.has_open_licence(p.id))');
  end if;

  select pg_get_functiondef('private.can_see_profile'::regproc) into d;
  if position('has_open_licence' in d) = 0 then
    execute replace(d, '(p.account_kind = ''clinician'' and p.verification_status = ''verified'')', '(p.account_kind = ''clinician'' and p.verification_status = ''verified'' and (p.is_demo or private.has_open_licence(p.id)))');
  end if;

  select pg_get_functiondef('public.network_licence_states'::regproc) into d;
  if position('has_open_licence' in d) = 0 then
    execute replace(d, 'and p.is_demo = public.viewer_is_demo()', 'and p.is_demo = public.viewer_is_demo()
    and (p.is_demo or private.has_open_licence(p.id))');
  end if;
end $$;

-- 3. Sign-up: open when app_config.signup_mode = 'open' (set on the real
-- project only), with a cap on new accounts per hour. An invitation link,
-- if used, is still redeemed.
create or replace function private.enforce_invitation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  tok text := coalesce(new.raw_user_meta_data ->> 'invite', '');
  inv cohort_invitations%rowtype;
  open_mode boolean := coalesce(private.cfg('signup_mode'), 'invite') = 'open';
begin
  if coalesce(new.raw_app_meta_data ->> 'created_by_system', '') = 'true' then
    return new;
  end if;
  if tok <> '' then
    select * into inv from cohort_invitations
    where token = tok and redeemed_at is null and revoked_at is null and expires_at > now()
    for update;
  end if;
  if not open_mode then
    if inv.id is null then
      raise exception 'PsyAlliance is invitation-only while the founding cohort forms.' using errcode = 'P0001';
    end if;
    if inv.email is not null and lower(inv.email) <> lower(new.email) then
      raise exception 'This invitation is for a different email address.' using errcode = 'P0001';
    end if;
  elsif (select count(*) from auth.users where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'A lot of people are signing up right now. Please try again in an hour.' using errcode = 'P0001';
  end if;
  if inv.id is not null and (inv.email is null or lower(inv.email) = lower(new.email)) then
    update cohort_invitations set redeemed_at = now(), redeemed_by = new.id where id = inv.id;
    if inv.join_request_id is not null then
      update join_requests set status = 'invited' where id = inv.join_request_id;
    end if;
  end if;
  return new;
end;
$function$;

-- 4. Who is interested in which state: the states given at sign-up and any
-- license added since. Real accounts only.
create or replace function private.state_interest()
 returns table(uid uuid, state text, joined timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select distinct u.id, s.state, u.created_at
  from auth.users u
  left join profiles p on p.id = u.id
  cross join lateral (
    select upper(trim(x)) state from jsonb_array_elements_text(coalesce(u.raw_user_meta_data -> 'states', '[]'::jsonb)) x
    union
    select upper(trim(l.state)) from licenses l where l.profile_id = u.id and l.status = 'active'
  ) s
  where coalesce(p.is_demo, false) = false
    and coalesce(p.account_kind::text, 'clinician') = 'clinician'
    and coalesce(u.raw_app_meta_data ->> 'created_by_system', '') <> 'true'
    and s.state ~ '^[A-Z]{2}$';
$function$;

-- What the signed-in account can do, and where it waits.
create or replace function public.my_access()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with me as (select auth.uid() uid),
  mine as (select i.state, i.joined from private.state_interest() i, me where i.uid = me.uid),
  queue as (
    select m.state,
      (select count(*) from private.state_interest() i where i.state = m.state and (i.joined < m.joined or (i.joined = m.joined and i.uid <= (select uid from me)))) position,
      (select count(*) from private.state_interest() i where i.state = m.state) waiting
    from mine m
    where not exists (select 1 from open_states o where o.state = m.state and o.open)
  )
  select jsonb_build_object(
    'open_states', coalesce((select jsonb_agg(state order by state) from open_states where open), '[]'::jsonb),
    'my_states', coalesce((select jsonb_agg(state order by state) from mine), '[]'::jsonb),
    'in_open_state', exists (select 1 from mine join open_states o on o.state = mine.state and o.open),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('state', state, 'position', position, 'waiting', waiting) order by state) from queue), '[]'::jsonb),
    'signup', (select jsonb_build_object('qualification', u.raw_user_meta_data ->> 'qualification', 'states', u.raw_user_meta_data -> 'states', 'source', u.raw_user_meta_data ->> 'source', 'full_name', u.raw_user_meta_data ->> 'full_name') from auth.users u, me where u.id = me.uid)
  )
  from me where me.uid is not null;
$function$;

-- Admin: every state with interest or members, open or not.
create or replace function public.admin_states()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  return coalesce((
    with interest as (select * from private.state_interest()),
    lic as (
      select upper(trim(l.state)) state, l.profile_id from licenses l join profiles p on p.id = l.profile_id
      where not p.is_demo and p.verification_status = 'verified' and p.account_status = 'active'
        and l.status = 'active' and l.reviewed_at is not null and (l.expiration_date is null or l.expiration_date >= current_date)
    ),
    states as (select state from interest union select state from open_states union select state from lic)
    select jsonb_agg(jsonb_build_object(
      'state', s.state,
      'open', coalesce(o.open, false),
      'changed_at', o.changed_at,
      'verified', (select count(distinct profile_id) from lic where lic.state = s.state),
      'signed_up', (select count(distinct uid) from interest i where i.state = s.state),
      'awaiting', (select count(distinct i.uid) from interest i left join profiles p on p.id = i.uid where i.state = s.state and coalesce(p.verification_status::text, 'pending') <> 'verified')
    ) order by coalesce(o.open, false) desc, s.state)
    from states s left join open_states o on o.state = s.state
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_set_state_open(p_state text, p_open boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare st text := upper(trim(coalesce(p_state, '')));
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  if st !~ '^[A-Z]{2}$' then
    raise exception 'Choose a state.' using errcode = 'P0001';
  end if;
  insert into open_states (state, open, changed_at) values (st, coalesce(p_open, false), now())
  on conflict (state) do update set open = excluded.open, changed_at = now();
end;
$function$;

-- 5. Library leads: count accounts that started on a Library page too.
do $$ declare d text; begin
  select pg_get_functiondef('public.admin_library_leads'::regproc) into d;
  if position('raw_user_meta_data' in d) = 0 then
    execute replace(d,
      '(select source src, count(*) n from join_requests where source like ''library-%'' group by source)',
      '(select src, count(*) n from (select source src from join_requests where source like ''library-%'' union all select raw_user_meta_data ->> ''source'' from auth.users where raw_user_meta_data ->> ''source'' like ''library-%'') x group by src)');
  end if;
end $$;

-- 6. A sandbox from inside a real account. The real site calls this on the
-- demo project (anon), keeps the token for the account and reuses it until
-- it expires. Capped per hour and per day.
create or replace function public.start_sandbox(p_label text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t text;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    raise exception 'Sandboxes exist only on the sandbox site.' using errcode = 'P0001';
  end if;
  if (select count(*) from sandbox_passes where created_by is null and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from sandbox_passes where created_by is null and created_at > now() - interval '1 day') >= 200 then
    raise exception 'A lot of sandboxes have opened today. Please try again later.' using errcode = 'P0001';
  end if;
  insert into sandbox_passes (label)
  values (left('Account: ' || coalesce(nullif(trim(p_label), ''), 'unnamed'), 160))
  returning token into t;
  return t;
end;
$function$;

-- The account's sandbox link (real project).
create table if not exists public.sandbox_links (
  profile_id uuid primary key references auth.users(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.sandbox_links enable row level security;
create policy "own sandbox link" on public.sandbox_links for select to authenticated using (profile_id = auth.uid());
create policy "own sandbox link insert" on public.sandbox_links for insert to authenticated with check (profile_id = auth.uid());
create policy "own sandbox link update" on public.sandbox_links for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Real project only (run there, not on the demo project):
--   insert into public.app_config (key, value) values ('signup_mode', 'open')
--   on conflict (key) do update set value = excluded.value;
