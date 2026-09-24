-- Trust rule "Verified means reviewed" (Product Spec v1): a licence counts
-- toward listing and matching only once an admin has reviewed it. Until
-- now a member could self-enter a licence with status 'active' and it was
-- treated as reviewed.

alter table public.licenses
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

-- Admins need to see and review every licence (member RLS stays owner-only).
drop policy if exists "admins can read all licences" on public.licenses;
create policy "admins can read all licences" on public.licenses
  for select using (private.is_admin_user((select auth.uid())));
drop policy if exists "admins can review licences" on public.licenses;
create policy "admins can review licences" on public.licenses
  for update using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));

-- Members can't mark their own licence reviewed, and editing the facts of
-- a reviewed licence (state, number, expiry) sends it back for review.
create or replace function public.guard_licence_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := private.is_admin_user(auth.uid());
begin
  if auth.uid() is null then
    return new; -- service role / migrations
  end if;
  if tg_op = 'INSERT' then
    if not is_admin then
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
    return new;
  end if;
  if not is_admin then
    if new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by then
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
    end if;
    if new.state is distinct from old.state
       or new.license_number is distinct from old.license_number
       or new.expiration_date is distinct from old.expiration_date then
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_licence_review on public.licenses;
create trigger guard_licence_review
  before insert or update on public.licenses
  for each row execute function public.guard_licence_review();

create or replace function public.has_active_licence(target uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from licenses l
    where l.profile_id = target
      and l.status = 'active'
      and l.reviewed_at is not null
      and (l.expiration_date is null or l.expiration_date >= current_date)
  );
$$;

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
    and p.is_demo = public.viewer_is_demo()
  group by l.profile_id;
$$;

-- Demo parity: the 60 seed accounts get a reviewed licence in their
-- primary state so a demo login sees a working network. These never
-- reach real members (is_demo parity in every read path).
insert into public.licenses (profile_id, state, license_number, license_type, status, expiration_date, notes, reviewed_at)
select p.id, upper(p.primary_state), 'DEMO-' || substr(p.id::text, 1, 8),
       case when p.qualification_level::text in ('MD','DO') then 'Physician' else 'Licensed Psychologist' end,
       'active', (current_date + interval '2 years')::date, 'Demo seed licence', now()
from public.profiles p
where p.is_demo and p.primary_state is not null
  and not exists (select 1 from public.licenses l where l.profile_id = p.id);
