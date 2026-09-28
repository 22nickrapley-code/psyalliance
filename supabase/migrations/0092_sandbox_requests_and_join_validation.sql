-- Sandbox requests and stricter join requests (28 Sept 2026).
--
-- 1. Prospects on the demo site can ask for a personal sandbox. The request
--    lands in Admin > Sandbox passes; an admin issues (or declines) it. Only
--    the demo accepts requests.
-- 2. request_to_join requires a name, a valid email, a qualification and at
--    least one licensed state: cohorts open by state, so a request without
--    one can't be placed.
-- Applied to both projects so their functions stay identical.

create table if not exists public.sandbox_requests (
  id bigint generated always as identity primary key,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  role text,
  state text,
  note text check (note is null or char_length(note) <= 600),
  status text not null default 'new' check (status in ('new', 'issued', 'declined')),
  pass_id bigint references public.sandbox_passes(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);
create index if not exists sandbox_requests_status_idx on public.sandbox_requests (status, created_at desc);
create index if not exists sandbox_requests_pass_idx on public.sandbox_requests (pass_id);
create index if not exists sandbox_requests_decided_by_idx on public.sandbox_requests (decided_by);
alter table public.sandbox_requests enable row level security;
drop policy if exists "admins manage sandbox requests" on public.sandbox_requests;
create policy "admins manage sandbox requests" on public.sandbox_requests
  for all to authenticated
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));
revoke all on public.sandbox_requests from anon;
grant select, insert, update, delete on public.sandbox_requests to authenticated;

create or replace function public.request_sandbox(p_full_name text, p_email text, p_role text, p_state text, p_note text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  em text := lower(trim(coalesce(p_email, '')));
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    raise exception 'Sandboxes exist only on the demo site.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please give your name.' using errcode = 'P0001';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please give a valid email address.' using errcode = 'P0001';
  end if;
  if exists (select 1 from sandbox_requests where lower(email) = em and status = 'new') then
    return true;
  end if;
  if (select count(*) from sandbox_requests where created_at > now() - interval '1 hour') > 30 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = 'P0001';
  end if;
  insert into sandbox_requests (full_name, email, role, state, note)
  values (left(trim(p_full_name), 120), left(em, 200), nullif(left(trim(coalesce(p_role, '')), 60), ''),
          nullif(upper(left(trim(coalesce(p_state, '')), 2)), ''), nullif(left(trim(coalesce(p_note, '')), 600), ''));
  return true;
end;
$function$;
revoke execute on function public.request_sandbox(text, text, text, text, text) from public;
grant execute on function public.request_sandbox(text, text, text, text, text) to anon, authenticated;

create or replace function public.request_to_join(p_full_name text, p_email text, p_qualification text, p_states text, p_note text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  em text := lower(trim(coalesce(p_email, '')));
  st text := upper(regexp_replace(trim(coalesce(p_states, '')), '\s*,\s*', ', ', 'g'));
begin
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please give your full name.' using errcode = 'P0001';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please give a valid email address.' using errcode = 'P0001';
  end if;
  if coalesce(p_qualification, '') not in ('PhD', 'PsyD', 'EdD', 'MD', 'DO') then
    raise exception 'Please choose your doctoral qualification.' using errcode = 'P0001';
  end if;
  if st !~ '^[A-Z]{2}(, [A-Z]{2})*$' then
    raise exception 'Please choose at least one state where you are licensed.' using errcode = 'P0001';
  end if;
  if exists (select 1 from join_requests where lower(email) = em and status = 'new') then
    return true;
  end if;
  if (select count(*) from join_requests where created_at > now() - interval '1 hour') > 50 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = 'P0001';
  end if;
  insert into join_requests (full_name, email, qualification, licensed_states, practice_note)
  values (left(trim(p_full_name), 120), em, p_qualification, left(st, 200), nullif(left(trim(coalesce(p_note, '')), 1000), ''));
  return true;
end;
$function$;
