-- 0099: Continuity plans (a professional will with a named backup),
-- "I'm full" overflow pages, and the activation measure.
-- Applied to both projects.

-- ---------------------------------------------------------------------
-- A small helper: an in-app notification from one member to another.
create or replace function private.notify_member(p_recipient uuid, p_actor uuid, p_summary text, p_link text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ev bigint;
begin
  if p_recipient is null then return; end if;
  insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
  values ('system_notice', p_actor, 'member_web', p_summary, p_link, '{}'::jsonb)
  returning id into ev;
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at)
  values (ev, p_recipient, 'in_app', 'sent', now());
end;
$function$;

-- ---------------------------------------------------------------------
-- Continuity plan: one per member. Answers are free text about where
-- things are and what should happen; never client details or passwords.
create table if not exists public.continuity_plans (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  backup_profile_id uuid references public.profiles(id) on delete set null,
  backup_status text not null default 'none' check (backup_status in ('none', 'invited', 'accepted', 'declined')),
  backup_responded_at timestamptz,
  alternate_profile_id uuid references public.profiles(id) on delete set null,
  alternate_status text not null default 'none' check (alternate_status in ('none', 'invited', 'accepted', 'declined')),
  alternate_responded_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_backup_not_self check (backup_profile_id is distinct from profile_id),
  constraint continuity_alternate_not_self check (alternate_profile_id is distinct from profile_id)
);
create index if not exists continuity_plans_backup_idx on public.continuity_plans (backup_profile_id);
create index if not exists continuity_plans_alternate_idx on public.continuity_plans (alternate_profile_id);
alter table public.continuity_plans enable row level security;

create policy "owner reads own plan" on public.continuity_plans
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "accepted backup reads the plan" on public.continuity_plans
  for select to authenticated using (
    (backup_profile_id = (select auth.uid()) and backup_status = 'accepted')
    or (alternate_profile_id = (select auth.uid()) and alternate_status = 'accepted'));
create policy "owner writes own plan" on public.continuity_plans
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "owner updates own plan" on public.continuity_plans
  for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Owners name people; only the named person can accept or decline.
create or replace function private.continuity_guard()
 returns trigger
 language plpgsql
as $function$
begin
  if coalesce(current_setting('pa.continuity_response', true), '') <> 'on' then
    if tg_op = 'INSERT' or new.backup_profile_id is distinct from old.backup_profile_id then
      new.backup_status := case when new.backup_profile_id is null then 'none' else 'invited' end;
      new.backup_responded_at := null;
    else
      new.backup_status := old.backup_status;
      new.backup_responded_at := old.backup_responded_at;
    end if;
    if tg_op = 'INSERT' or new.alternate_profile_id is distinct from old.alternate_profile_id then
      new.alternate_status := case when new.alternate_profile_id is null then 'none' else 'invited' end;
      new.alternate_responded_at := null;
    else
      new.alternate_status := old.alternate_status;
      new.alternate_responded_at := old.alternate_responded_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger continuity_plans_guard
  before insert or update on public.continuity_plans
  for each row execute function private.continuity_guard();

-- Tell a newly named backup.
create or replace function private.continuity_invite_notice()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.backup_status = 'invited' and (tg_op = 'INSERT' or new.backup_profile_id is distinct from old.backup_profile_id) then
    perform private.notify_member(new.backup_profile_id, new.profile_id, 'named you as the backup in their continuity plan', '/dashboard/continuity/duties');
  end if;
  if new.alternate_status = 'invited' and (tg_op = 'INSERT' or new.alternate_profile_id is distinct from old.alternate_profile_id) then
    perform private.notify_member(new.alternate_profile_id, new.profile_id, 'named you as the alternate backup in their continuity plan', '/dashboard/continuity/duties');
  end if;
  return null;
end;
$function$;

create trigger continuity_plans_invite_notice
  after insert or update on public.continuity_plans
  for each row execute function private.continuity_invite_notice();

-- The named colleague accepts or declines.
create or replace function public.respond_continuity(p_owner uuid, p_accept boolean)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  plan record;
  role text;
begin
  select * into plan from continuity_plans where profile_id = p_owner;
  if plan.profile_id is null then
    raise exception 'That plan no longer exists.' using errcode = 'P0001';
  end if;
  if plan.backup_profile_id = me and plan.backup_status in ('invited', 'accepted', 'declined') then
    role := 'backup';
  elsif plan.alternate_profile_id = me and plan.alternate_status in ('invited', 'accepted', 'declined') then
    role := 'alternate';
  else
    raise exception 'You aren''t named in this plan.' using errcode = 'P0001';
  end if;
  perform set_config('pa.continuity_response', 'on', true);
  if role = 'backup' then
    update continuity_plans set backup_status = case when p_accept then 'accepted' else 'declined' end, backup_responded_at = now() where profile_id = p_owner;
  else
    update continuity_plans set alternate_status = case when p_accept then 'accepted' else 'declined' end, alternate_responded_at = now() where profile_id = p_owner;
  end if;
  perform set_config('pa.continuity_response', '', true);
  perform private.notify_member(p_owner, me,
    case when p_accept then 'agreed to be the ' || role || ' in your continuity plan' else 'can''t be the ' || role || ' in your continuity plan' end,
    '/dashboard/continuity');
  return case when p_accept then 'accepted' else 'declined' end;
end;
$function$;

-- Plans I'm named in: who, my role and where it stands (not the answers).
create or replace function public.my_continuity_duties()
 returns table(owner_id uuid, owner_name text, credential_prefix text, qualification_level text, primary_state text, role text, status text, updated_at timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select c.profile_id, p.full_name, p.credential_prefix, p.qualification_level::text, p.primary_state, 'backup', c.backup_status, c.updated_at
  from continuity_plans c join profiles p on p.id = c.profile_id
  where c.backup_profile_id = auth.uid() and c.backup_status <> 'none'
  union all
  select c.profile_id, p.full_name, p.credential_prefix, p.qualification_level::text, p.primary_state, 'alternate', c.alternate_status, c.updated_at
  from continuity_plans c join profiles p on p.id = c.profile_id
  where c.alternate_profile_id = auth.uid() and c.alternate_status <> 'none';
$function$;

-- ---------------------------------------------------------------------
-- "I'm full" pages. A member's consent to appear on trusted colleagues'
-- pages, with the contact details they choose to make public.
create table if not exists public.public_listings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  website text check (website is null or website ~* '^https?://'),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.public_listings enable row level security;
create policy "own public listing" on public.public_listings
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "own public listing insert" on public.public_listings
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "own public listing update" on public.public_listings
  for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create table if not exists public.overflow_pages (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  enabled boolean not null default false,
  message text check (message is null or length(message) <= 400),
  hidden uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.overflow_pages enable row level security;
create policy "own overflow page" on public.overflow_pages
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "own overflow page insert" on public.overflow_pages
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "own overflow page update" on public.overflow_pages
  for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Who could appear on a member's page, and why someone doesn't.
create or replace function private.overflow_candidates(p_owner uuid)
 returns table(profile_id uuid, full_name text, credential_prefix text, qualification_level text, city text, state text,
   listed boolean, open boolean, referral text, confirmed_at timestamptz, website text, phone text, email text, note text,
   focus text[], sessions text[])
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with trusted as (
    select case when c.requester_id = p_owner then c.addressee_id else c.requester_id end id
    from connections c
    where c.status = 'accepted' and c.tier in ('trusted_colleague', 'partner') and p_owner in (c.requester_id, c.addressee_id)
  )
  select p.id, p.full_name, p.credential_prefix, p.qualification_level::text, p.primary_practice_city, p.primary_state,
    coalesce(l.enabled, false),
    (p.referral_availability in ('yes', 'limited') and p.availability_confirmed_at > now() - interval '90 days'
      and (p.availability_paused_until is null or p.availability_paused_until < current_date)),
    p.referral_availability, p.availability_confirmed_at, l.website, l.phone, l.email, l.note,
    (select array_agg(lv.value order by v.rank) from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
      where v.profile_id = p.id and lv.category = 'treatment_specialism' and v.rank is not null),
    (select array_agg(lv.value) from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
      where v.profile_id = p.id and lv.category = 'session_type')
  from trusted t
  join profiles p on p.id = t.id
  left join public_listings l on l.profile_id = p.id
  where private.is_network_member(p.id) and not public.is_blocked_between(p_owner, p.id);
$function$;

create or replace function public.my_overflow_candidates()
 returns table(profile_id uuid, full_name text, credential_prefix text, qualification_level text, city text, state text,
   listed boolean, open boolean, referral text, confirmed_at timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select profile_id, full_name, credential_prefix, qualification_level, city, state, listed, open, referral, confirmed_at
  from private.overflow_candidates(auth.uid());
$function$;

-- The public page: anyone with the link, no sign-in.
create or replace function public.overflow_page(p_slug text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  pg record;
  owner record;
begin
  select * into pg from overflow_pages where slug = lower(p_slug) and enabled;
  if pg.profile_id is null or not private.is_network_member(pg.profile_id) then
    return null;
  end if;
  select full_name, credential_prefix, qualification_level::text q, primary_practice_city city, primary_state state into owner from profiles where id = pg.profile_id;
  return jsonb_build_object(
    'owner', jsonb_build_object('name', owner.full_name, 'prefix', owner.credential_prefix, 'qualification', owner.q, 'city', owner.city, 'state', owner.state),
    'message', pg.message,
    'colleagues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', c.full_name, 'prefix', c.credential_prefix, 'qualification', c.qualification_level, 'city', c.city, 'state', c.state,
        'referral', c.referral, 'confirmed_at', c.confirmed_at, 'website', c.website, 'phone', c.phone, 'email', c.email, 'note', c.note,
        'focus', coalesce(c.focus[1:3], '{}'), 'sessions', coalesce(c.sessions, '{}'))
        order by (c.referral = 'yes') desc, c.confirmed_at desc)
      from private.overflow_candidates(pg.profile_id) c
      where c.listed and c.open and not (c.profile_id = any (pg.hidden))
    ), '[]'::jsonb));
end;
$function$;

-- ---------------------------------------------------------------------
-- Activation: verified, at least 3 trusted colleagues and availability
-- confirmed, all within 7 days of joining.
alter table public.profiles add column if not exists first_availability_confirmed_at timestamptz;
update public.profiles set first_availability_confirmed_at = availability_confirmed_at
where first_availability_confirmed_at is null and availability_confirmed_at is not null;

create or replace function private.stamp_first_availability()
 returns trigger
 language plpgsql
as $function$
begin
  if new.availability_confirmed_at is not null and new.first_availability_confirmed_at is null then
    new.first_availability_confirmed_at := new.availability_confirmed_at;
  end if;
  return new;
end;
$function$;

create trigger profiles_first_availability
  before insert or update of availability_confirmed_at on public.profiles
  for each row execute function private.stamp_first_availability();

create or replace function public.admin_activation(p_weeks int default 12)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare result jsonb;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  with m as (
    select p.id, p.full_name, p.created_at, p.verified_at,
      p.first_availability_confirmed_at fa,
      (select min(t.at) from (
         select c.responded_at at,
           row_number() over (order by c.responded_at) n
         from connections c
         where c.status = 'accepted' and c.tier in ('trusted_colleague', 'partner') and p.id in (c.requester_id, c.addressee_id)
       ) t where t.n = 3) third_trusted
    from profiles p
    where p.account_kind = 'clinician' and not p.is_demo and p.created_at > now() - make_interval(weeks => p_weeks)
  ),
  s as (
    select m.*,
      (m.verified_at is not null and m.verified_at <= m.created_at + interval '7 days') v7,
      (m.third_trusted is not null and m.third_trusted <= m.created_at + interval '7 days') t7,
      (m.fa is not null and m.fa <= m.created_at + interval '7 days') a7
    from m
  )
  select jsonb_build_object(
    'definition', 'Verified, at least 3 trusted colleagues and availability confirmed, all within 7 days of joining',
    'cohorts', coalesce((select jsonb_agg(row_to_json(c) order by c.week desc) from (
      select date_trunc('week', created_at)::date week, count(*) joined,
        count(*) filter (where v7) verified, count(*) filter (where t7) trusted3, count(*) filter (where a7) availability,
        count(*) filter (where v7 and t7 and a7) activated,
        count(*) filter (where created_at > now() - interval '7 days') still_in_window
      from s group by 1) c), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'joined', created_at,
        'verified', verified_at is not null, 'trusted3', third_trusted is not null, 'availability', fa is not null) order by created_at desc)
      from s where not (v7 and t7 and a7) and created_at > now() - interval '30 days'), '[]'::jsonb))
  into result;
  return result;
end;
$function$;

-- ---------------------------------------------------------------------
-- Demo: named backups in a sandbox guest's plan agree after a minute, and
-- demo members who are taking referrals appear on "I'm full" pages with
-- fictional contact details (edited in place; the listing rows were also
-- inserted once on the demo project).
do $do$
declare def text := pg_get_functiondef('private.demo_autorespond'::regproc);
begin
  if strpos(def, 'continuity_plans') > 0 then return; end if;
  if strpos(def, E'  return acted;\nend;') = 0 then raise exception 'marker not found'; end if;
  def := replace(def, E'  return acted;\nend;', E'  -- Named backups in a sandbox guest''s continuity plan agree after a minute.\n  for r in\n    select c.profile_id as owner, c.backup_profile_id as backup, c.alternate_profile_id as alternate, c.backup_status, c.alternate_status\n    from continuity_plans c\n    where private.is_sandbox_guest(c.profile_id) and c.updated_at < now() - interval ''1 minute''\n      and (c.backup_status = ''invited'' or c.alternate_status = ''invited'')\n  loop\n    perform set_config(''pa.continuity_response'', ''on'', true);\n    update continuity_plans set\n      backup_status = case when backup_status = ''invited'' then ''accepted'' else backup_status end,\n      backup_responded_at = case when backup_status = ''invited'' then now() else backup_responded_at end,\n      alternate_status = case when alternate_status = ''invited'' then ''accepted'' else alternate_status end,\n      alternate_responded_at = case when alternate_status = ''invited'' then now() else alternate_responded_at end\n    where profile_id = r.owner;\n    perform set_config(''pa.continuity_response'', '''', true);\n    if r.backup_status = ''invited'' then\n      perform private.notify_member(r.owner, r.backup, ''agreed to be the backup in your continuity plan'', ''/dashboard/continuity'');\n    end if;\n    if r.alternate_status = ''invited'' then\n      perform private.notify_member(r.owner, r.alternate, ''agreed to be the alternate backup in your continuity plan'', ''/dashboard/continuity'');\n    end if;\n    acted := acted + 1;\n  end loop;\n\n  return acted;\nend;');
  execute def;
end
$do$;

do $do$
declare def text := pg_get_functiondef('private.seed_demo_network'::regproc);
begin
  if strpos(def, 'public_listings') > 0 then return; end if;
  if strpos(def, 'return (select count(*) from profiles where is_demo)::text') = 0 then raise exception 'seed marker not found'; end if;
  def := replace(def, '  return (select count(*) from profiles where is_demo)::text', E'  -- Members who agree to appear on trusted colleagues'' "I''''m full" pages,\n  -- with fictional contact details.\n  insert into public_listings (profile_id, enabled, phone, note)\n  select p.id, true, ''(212) 555-01'' || lpad((abs(hashtext(p.id::text)) % 100)::text, 2, ''0''),\n    ''Fictional demo contact''\n  from profiles p where p.is_demo and p.referral_availability in (''yes'', ''limited'')\n  on conflict (profile_id) do nothing;\n\n  return (select count(*) from profiles where is_demo)::text');
  execute def;
end
$do$;

-- Demo project only, once:
-- insert into public_listings (profile_id, enabled, phone, note)
-- select p.id, true, '(212) 555-01' || lpad((abs(hashtext(p.id::text)) % 100)::text, 2, '0'), 'Fictional demo contact'
-- from profiles p where p.is_demo and p.referral_availability in ('yes', 'limited') and not private.is_sandbox_guest(p.id)
-- on conflict (profile_id) do nothing;
