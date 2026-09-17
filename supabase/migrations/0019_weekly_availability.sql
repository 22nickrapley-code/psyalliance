-- Weekly availability - the recurring "which days are you generally taking
-- new sessions/consultations" grid that recurs throughout the spec's
-- calendar mockups (S M T W T F S). Kept simple: a day-of-week toggle per
-- profile, readable by any authenticated user once the profile is verified
-- (mirrors the profiles cross-user visibility fix - this is exactly the
-- kind of non-sensitive scheduling info a colleague needs before proposing
-- coverage or a referral).
create table profile_availability (
  profile_id uuid not null references profiles (id) on delete cascade,
  day_of_week smallint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, day_of_week),
  constraint valid_day_of_week check (day_of_week between 0 and 6)
);

alter table profile_availability enable row level security;

create policy "own availability is fully manageable" on profile_availability
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "verified profiles' availability is readable by any authenticated user" on profile_availability
  for select using (
    exists (select 1 from profiles p where p.id = profile_id and p.verification_status = 'verified')
  );

grant select on profile_availability to authenticated;
