-- M2: network tiers. "Partners" and "Bench" are user-declared, mutual-consent
-- connections (like a LinkedIn connection request). "Recommended" is
-- deliberately NOT a stored relationship - it's computed on the fly from
-- shared specialisms/state via public_directory, so there's no scoring
-- engine to build or keep in sync yet.

create type connection_tier as enum ('partner', 'bench');
create type connection_status as enum ('pending', 'accepted', 'declined');

create table connections (
  id bigint generated always as identity primary key,
  requester_id uuid not null references profiles (id) on delete cascade,
  addressee_id uuid not null references profiles (id) on delete cascade,
  tier connection_tier not null default 'partner',
  status connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_connection check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

alter table connections enable row level security;

create policy "see connections you're party to" on connections
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "create connections you request" on connections
  for insert with check (auth.uid() = requester_id);

create policy "respond to or update your own connections" on connections
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "withdraw connections you're party to" on connections
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);
