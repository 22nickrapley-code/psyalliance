-- M3: human-in-the-loop credential verification review queue.
-- Automated state-board/ASPPB/NPI lookups are NOT built here (that's a
-- separate integration project per state) - this lands the workflow shell:
-- a user submits what they have, an admin (Nick/Rena) reviews and decides.

alter table profiles add column is_admin boolean not null default false;

create policy "users can submit their own credential verification requests" on credential_verifications
  for insert with check (auth.uid() = profile_id);

create policy "admins can see all credential verifications" on credential_verifications
  for select using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

create policy "admins can update credential verifications" on credential_verifications
  for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

create policy "admins can update any profile's verification status" on profiles
  for update using (
    exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin)
  );

create policy "admins can see all profiles" on profiles
  for select using (
    exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin)
  );
