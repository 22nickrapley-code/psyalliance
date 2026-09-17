-- Performance pass on the Supabase advisor's findings: every RLS policy
-- calling auth.uid()/auth.role() directly gets it re-evaluated per row.
-- Wrapping the call as (select auth.uid()) lets Postgres evaluate it once
-- per statement instead. Semantics are unchanged - this only fixes the
-- auth_rls_initplan performance warnings; every policy below keeps the
-- exact same using/with check logic it had before.
--
-- (The security_definer_view finding on public_directory and the
-- multiple_permissive_policies findings are left as-is: the view
-- deliberately runs with the creator's privileges so anon/authenticated
-- can see OTHER people's verified rows, which their own RLS would
-- otherwise block - that's the point of the view. And the "multiple
-- policies" findings are just the expected shape of "owner OR admin" and
-- "owner OR world-scope" access - collapsing them isn't worth the
-- complexity at this scale.)

-- profiles
drop policy "own profile only" on profiles;
create policy "own profile only" on profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy "admins can update any profile's verification status" on profiles;
create policy "admins can update any profile's verification status" on profiles
  for update using (
    exists (select 1 from profiles p2 where p2.id = (select auth.uid()) and p2.is_admin)
  );

drop policy "admins can see all profiles" on profiles;
create policy "admins can see all profiles" on profiles
  for select using (
    exists (select 1 from profiles p2 where p2.id = (select auth.uid()) and p2.is_admin)
  );

-- lookup_values
drop policy "lookup values are readable by any authenticated user" on lookup_values;
create policy "lookup values are readable by any authenticated user" on lookup_values
  for select using ((select auth.role()) = 'authenticated');

-- profile_lookup_values
drop policy "own profile lookup values only" on profile_lookup_values;
create policy "own profile lookup values only" on profile_lookup_values
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- credential_verifications
drop policy "own credential records only" on credential_verifications;
create policy "own credential records only" on credential_verifications
  for select using ((select auth.uid()) = profile_id);

drop policy "users can submit their own credential verification requests" on credential_verifications;
create policy "users can submit their own credential verification requests" on credential_verifications
  for insert with check ((select auth.uid()) = profile_id);

drop policy "admins can see all credential verifications" on credential_verifications;
create policy "admins can see all credential verifications" on credential_verifications
  for select using (
    exists (select 1 from profiles where id = (select auth.uid()) and is_admin)
  );

drop policy "admins can update credential verifications" on credential_verifications;
create policy "admins can update credential verifications" on credential_verifications
  for update using (
    exists (select 1 from profiles where id = (select auth.uid()) and is_admin)
  );

-- books_of_business
drop policy "own books of business only" on books_of_business;
create policy "own books of business only" on books_of_business
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- caseload_clients
drop policy "own caseload only" on caseload_clients;
create policy "own caseload only" on caseload_clients
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- capacity_settings
drop policy "own capacity settings only" on capacity_settings;
create policy "own capacity settings only" on capacity_settings
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- practice_overhead_expenses
drop policy "own overhead expenses only" on practice_overhead_expenses;
create policy "own overhead expenses only" on practice_overhead_expenses
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- documents
drop policy "own documents only" on documents;
create policy "own documents only" on documents
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

drop policy "world documents are readable by any authenticated user" on documents;
create policy "world documents are readable by any authenticated user" on documents
  for select using (owner_scope = 'world' and (select auth.role()) = 'authenticated');

-- connections
drop policy "see connections you're party to" on connections;
create policy "see connections you're party to" on connections
  for select using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

drop policy "create connections you request" on connections;
create policy "create connections you request" on connections
  for insert with check ((select auth.uid()) = requester_id);

drop policy "respond to or update your own connections" on connections;
create policy "respond to or update your own connections" on connections
  for update using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id)
  with check ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

drop policy "withdraw connections you're party to" on connections;
create policy "withdraw connections you're party to" on connections
  for delete using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

-- referral_requests
drop policy "open referral requests are visible to any authenticated user" on referral_requests;
create policy "open referral requests are visible to any authenticated user" on referral_requests
  for select using (status = 'open' or (select auth.uid()) = requesting_profile_id);

drop policy "create your own referral requests" on referral_requests;
create policy "create your own referral requests" on referral_requests
  for insert with check ((select auth.uid()) = requesting_profile_id);

drop policy "update your own referral requests" on referral_requests;
create policy "update your own referral requests" on referral_requests
  for update using ((select auth.uid()) = requesting_profile_id)
  with check ((select auth.uid()) = requesting_profile_id);

-- referral_responses
drop policy "see responses to your own requests or your own responses" on referral_responses;
create policy "see responses to your own requests or your own responses" on referral_responses
  for select using (
    (select auth.uid()) = responding_profile_id
    or (select auth.uid()) = (select requesting_profile_id from referral_requests where id = referral_request_id)
  );

drop policy "respond to open requests that aren't your own" on referral_responses;
create policy "respond to open requests that aren't your own" on referral_responses
  for insert with check (
    (select auth.uid()) = responding_profile_id
    and (select auth.uid()) <> (select requesting_profile_id from referral_requests where id = referral_request_id)
  );

drop policy "request owner or responder can update a response" on referral_responses;
create policy "request owner or responder can update a response" on referral_responses
  for update using (
    (select auth.uid()) = responding_profile_id
    or (select auth.uid()) = (select requesting_profile_id from referral_requests where id = referral_request_id)
  );

-- storage.objects policies (documents bucket) - same fix
drop policy "personal documents are owner-only" on storage.objects;
create policy "personal documents are owner-only"
on storage.objects for all
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'personal'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'personal'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy "shared documents are readable by any authenticated user" on storage.objects;
create policy "shared documents are readable by any authenticated user"
on storage.objects for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and (select auth.role()) = 'authenticated'
);

drop policy "shared documents are writable only by their uploader" on storage.objects;
create policy "shared documents are writable only by their uploader"
on storage.objects for insert
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and owner = (select auth.uid())
);

drop policy "shared documents are only editable by their uploader" on storage.objects;
create policy "shared documents are only editable by their uploader"
on storage.objects for update
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and owner = (select auth.uid())
);

drop policy "shared documents are only deletable by their uploader" on storage.objects;
create policy "shared documents are only deletable by their uploader"
on storage.objects for delete
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'shared'
  and owner = (select auth.uid())
);

-- Missing covering indexes on foreign keys (performance advisor)
create index if not exists idx_books_of_business_profile_id on books_of_business (profile_id);
create index if not exists idx_caseload_clients_profile_id on caseload_clients (profile_id);
create index if not exists idx_caseload_clients_book_of_business_id on caseload_clients (book_of_business_id);
create index if not exists idx_connections_addressee_id on connections (addressee_id);
create index if not exists idx_credential_verifications_profile_id on credential_verifications (profile_id);
create index if not exists idx_credential_verifications_reviewed_by on credential_verifications (reviewed_by);
create index if not exists idx_documents_profile_id on documents (profile_id);
create index if not exists idx_documents_uploaded_by on documents (uploaded_by);
create index if not exists idx_practice_overhead_expenses_profile_id on practice_overhead_expenses (profile_id);
create index if not exists idx_profile_lookup_values_lookup_value_id on profile_lookup_values (lookup_value_id);
create index if not exists idx_referral_requests_requesting_profile_id on referral_requests (requesting_profile_id);
create index if not exists idx_referral_requests_specialism_lookup_id on referral_requests (specialism_lookup_id);
create index if not exists idx_referral_responses_responding_profile_id on referral_responses (responding_profile_id);
