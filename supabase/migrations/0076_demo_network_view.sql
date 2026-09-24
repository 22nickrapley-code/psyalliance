-- Demo network view. Fake accounts (profiles.is_demo) are invisible to
-- real members everywhere. A profile with demo_view switched on sees the
-- demo network instead of the real one, so the founders can walk through
-- every feature with realistic data. Only admins can switch it on (for
-- themselves or another account); anyone can switch their own off.

alter table public.profiles add column if not exists demo_view boolean not null default false;

create or replace function public.viewer_is_demo()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce((select is_demo or demo_view from profiles where id = auth.uid()), false);
$$;

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
    -- Members may leave the demo view, never enter it.
    if new.demo_view and not old.demo_view then
      new.demo_view := old.demo_view;
    end if;
  end if;
  return new;
end;
$$;
