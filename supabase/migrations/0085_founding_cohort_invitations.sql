-- Invite-controlled founding cohort.
--
-- New accounts need an invitation while signup_mode is 'invite' (the
-- default). The check lives on auth.users itself, so it holds for every
-- path: the sign-up form, the API, or an OAuth sign-in. Prospective
-- members without an invitation ask for one through /join; an admin
-- reviews the request and issues a personal, time-limited invitation link.

create table if not exists public.cohort_invitations (
  id bigint generated always as identity primary key,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  email text,
  full_name text,
  note text,
  join_request_id bigint,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  redeemed_at timestamptz,
  redeemed_by uuid,
  revoked_at timestamptz
);
create index if not exists cohort_invitations_created_by_idx on public.cohort_invitations(created_by);
alter table public.cohort_invitations enable row level security;
drop policy if exists "admins manage invitations" on public.cohort_invitations;
create policy "admins manage invitations" on public.cohort_invitations
  for all to authenticated
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));

create table if not exists public.join_requests (
  id bigint generated always as identity primary key,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  qualification text check (qualification in ('PhD', 'PsyD', 'EdD', 'MD', 'DO')),
  licensed_states text check (length(licensed_states) <= 120),
  practice_note text check (length(practice_note) <= 600),
  status text not null default 'new' check (status in ('new', 'invited', 'declined')),
  handled_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists join_requests_handled_by_idx on public.join_requests(handled_by);
create index if not exists join_requests_email_idx on public.join_requests(lower(email));
alter table public.join_requests enable row level security;
drop policy if exists "admins manage join requests" on public.join_requests;
create policy "admins manage join requests" on public.join_requests
  for all to authenticated
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));

-- Public: ask to join. One open request per email; quietly accepts repeats.
create or replace function public.request_to_join(p_full_name text, p_email text, p_qualification text, p_states text, p_note text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from join_requests where lower(email) = lower(trim(p_email)) and status = 'new') then
    return true;
  end if;
  if (select count(*) from join_requests where created_at > now() - interval '1 hour') > 50 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = 'P0001';
  end if;
  insert into join_requests (full_name, email, qualification, licensed_states, practice_note)
  values (trim(p_full_name), lower(trim(p_email)), nullif(p_qualification, ''), nullif(trim(p_states), ''), nullif(trim(p_note), ''));
  return true;
end;
$$;
revoke execute on function public.request_to_join(text, text, text, text, text) from public;
grant execute on function public.request_to_join(text, text, text, text, text) to anon, authenticated;

-- Public: is this invitation usable? Returns the email it is bound to.
create or replace function public.invitation_status(p_token text)
returns table(valid boolean, email text, full_name text)
language sql
stable security definer
set search_path to 'public'
as $$
  select true, i.email, i.full_name
  from cohort_invitations i
  where i.token = p_token and i.redeemed_at is null and i.revoked_at is null and i.expires_at > now();
$$;
revoke execute on function public.invitation_status(text) from public;
grant execute on function public.invitation_status(text) to anon, authenticated;

-- The gate, on every new auth user.
create or replace function private.enforce_invitation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tok text := coalesce(new.raw_user_meta_data ->> 'invite', '');
  inv record;
begin
  if coalesce(private.cfg('signup_mode'), 'invite') = 'open' then
    return new;
  end if;
  -- Accounts created by the system (demo sandboxes, release checks) say so.
  if coalesce(new.raw_app_meta_data ->> 'created_by_system', '') = 'true' then
    return new;
  end if;
  select * into inv from cohort_invitations
  where token = tok and redeemed_at is null and revoked_at is null and expires_at > now()
  for update;
  if inv.id is null then
    raise exception 'PsyAlliance is invitation-only while the founding cohort forms. Ask to join at /join.' using errcode = 'P0001';
  end if;
  if inv.email is not null and lower(inv.email) <> lower(new.email) then
    raise exception 'This invitation is for a different email address.' using errcode = 'P0001';
  end if;
  update cohort_invitations set redeemed_at = now(), redeemed_by = new.id where id = inv.id;
  if inv.join_request_id is not null then
    update join_requests set status = 'invited' where id = inv.join_request_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_invitation() from public, anon, authenticated;
drop trigger if exists enforce_invitation on auth.users;
create trigger enforce_invitation before insert on auth.users
  for each row execute function private.enforce_invitation();
