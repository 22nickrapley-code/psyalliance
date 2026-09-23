-- Sept 23 launch-readiness audit fix: the Profile page's "Accepting
-- referrals" badge and the Availability page's confirmed tri-state
-- disagreed on someone else's profile too, not just your own - because
-- public_directory (what /dashboard/people/[id] and /dashboard/network
-- read) never carried referral_availability/coverage_availability/
-- consultation_availability/availability_confirmed_at at all. It's been
-- stuck at the 0032 column list since it was created, from before those
-- columns existed (0045). Recreating with the same column list plus the
-- four availability-signal columns - definition otherwise byte-for-byte
-- identical to the live view (confirmed via pg_get_viewdef before writing
-- this migration), same security_invoker=true, same grants.
drop view public.public_directory;

create view public.public_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.credential_prefix,
  p.qualification_level,
  p.board_certified,
  p.primary_practice_city,
  p.primary_state,
  p.accepting_referrals,
  p.referral_availability,
  p.coverage_availability,
  p.consultation_availability,
  p.availability_confirmed_at,
  p.last_active_at,
  p.practice_website,
  p.contact_phone,
  p.contact_email,
  p.open_to_group_consultation,
  p.open_to_give_supervision,
  p.open_to_receive_supervision,
  p.psypact_participating,
  p.avatar_path,
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified';

revoke all on public.public_directory from anon;
grant select on public.public_directory to authenticated;
