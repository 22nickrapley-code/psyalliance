-- Rebuild Phase 4, batch 3, part 2: Referrals rebuild - audience choice
-- (Master Brief #26 / Addendum: My trusted colleagues / Selected
-- clinicians / Saved & suggested / The verified PsyAlliance network) and
-- the extra structured criteria fields that reduce how much a requester
-- needs to put in the free-text notes field.
--
-- Data-boundary rule (Addendum A7, Level 1 only): every new column is
-- structured, non-identifying matching data. notes stays free text for
-- now (useful context like "prefers telehealth") but must never contain a
-- patient name - same convention as coverage_plan_cases.case_reference.

alter table referral_requests
  add column if not exists audience_type text not null default 'wider_network'
    check (audience_type in ('trusted', 'selected', 'suggested', 'wider_network')),
  -- Only meaningful when audience_type = 'selected' - the specific
  -- clinicians chosen to receive this referral.
  add column if not exists audience_profile_ids uuid[] not null default '{}',
  add column if not exists age_band text,
  add column if not exists modality text;

comment on column referral_requests.notes is
  'Free-text context for the receiving clinician (e.g. "prefers telehealth") - must never contain a patient name or other identifier (Addendum A7, Level 1 data only).';

comment on column referral_requests.audience_type is
  'Who this referral is visible to: trusted colleagues only, a hand-picked selected list, algorithmically suggested clinicians, or the wider verified network (Master Brief #26).';

-- The existing "any authenticated user can see an open request" policy
-- predates audience choice entirely - it would leak 'trusted'/'selected'
-- referrals to the whole network. Replaced with an audience-aware version:
-- always visible to its own requester; visible network-wide only for
-- 'wider_network' or 'suggested' audience; 'trusted' visible only to the
-- requester's accepted trusted colleagues; 'selected' visible only to the
-- profiles explicitly named in audience_profile_ids.
drop policy if exists "open referral requests are visible to any authenticated user" on referral_requests;

create policy "referral requests are visible per their chosen audience" on referral_requests
  for select using (
    (select auth.uid()) = requesting_profile_id
    or (
      status in ('open', 'sent', 'connected', 'handoff')
      and (
        audience_type in ('wider_network', 'suggested')
        or (
          audience_type = 'selected'
          and (select auth.uid()) = any (audience_profile_ids)
        )
        or (
          audience_type = 'trusted'
          and exists (
            select 1 from connections c
            where c.tier = 'trusted_colleague' and c.status = 'accepted'
              and (
                (c.requester_id = requesting_profile_id and c.addressee_id = (select auth.uid()))
                or (c.addressee_id = requesting_profile_id and c.requester_id = (select auth.uid()))
              )
          )
        )
      )
    )
  );
