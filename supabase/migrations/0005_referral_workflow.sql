-- M2: referral / coverage workflow. A psychologist posts an open need
-- (specialism, state, insurance, notes); colleagues respond; the requester
-- accepts one response, closing the request.

create type referral_status as enum ('open', 'matched', 'closed');
create type referral_response_status as enum ('offered', 'accepted', 'declined', 'withdrawn');

create table referral_requests (
  id bigint generated always as identity primary key,
  requesting_profile_id uuid not null references profiles (id) on delete cascade,
  specialism_lookup_id bigint references lookup_values (id),
  state text,
  insurance text,
  notes text,
  status referral_status not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table referral_responses (
  id bigint generated always as identity primary key,
  referral_request_id bigint not null references referral_requests (id) on delete cascade,
  responding_profile_id uuid not null references profiles (id) on delete cascade,
  message text,
  status referral_response_status not null default 'offered',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (referral_request_id, responding_profile_id)
);

alter table referral_requests enable row level security;
alter table referral_responses enable row level security;

create policy "open referral requests are visible to any authenticated user" on referral_requests
  for select using (status = 'open' or auth.uid() = requesting_profile_id);

create policy "create your own referral requests" on referral_requests
  for insert with check (auth.uid() = requesting_profile_id);

create policy "update your own referral requests" on referral_requests
  for update using (auth.uid() = requesting_profile_id)
  with check (auth.uid() = requesting_profile_id);

create policy "see responses to your own requests or your own responses" on referral_responses
  for select using (
    auth.uid() = responding_profile_id
    or auth.uid() = (select requesting_profile_id from referral_requests where id = referral_request_id)
  );

create policy "respond to open requests that aren't your own" on referral_responses
  for insert with check (
    auth.uid() = responding_profile_id
    and auth.uid() <> (select requesting_profile_id from referral_requests where id = referral_request_id)
  );

create policy "request owner or responder can update a response" on referral_responses
  for update using (
    auth.uid() = responding_profile_id
    or auth.uid() = (select requesting_profile_id from referral_requests where id = referral_request_id)
  );
