-- Recovered from the live migration history (applied 21 Sept 2026 as
-- "0042_channel_requests" but never committed). Already applied on both
-- hosted projects; kept so a fresh database can be rebuilt from this folder.
create table if not exists channel_requests (
  id bigint generated always as identity primary key,
  requested_by uuid not null references profiles(id) on delete cascade,
  channel_name text not null check (char_length(trim(channel_name)) > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists channel_requests_status_idx on channel_requests(status);

alter table channel_requests enable row level security;

create policy "users can submit their own channel requests"
  on channel_requests for insert
  with check ((select auth.uid()) = requested_by);

create policy "users can see their own channel requests"
  on channel_requests for select
  using ((select auth.uid()) = requested_by);

create policy "admins can see all channel requests"
  on channel_requests for select
  using (is_admin_user((select auth.uid())));

create policy "admins can update channel requests"
  on channel_requests for update
  using (is_admin_user((select auth.uid())));

create policy "admins can create channels"
  on town_hall_channels for insert
  with check (is_admin_user((select auth.uid())));
