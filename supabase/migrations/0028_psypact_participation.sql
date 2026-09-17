-- Considerations.txt explicitly calls for a PSYPACT feature: "Build in
-- Psypact state feature - allowing Practitioners to work across state
-- lines (virtually)". PSYPACT (psypact.org) is the real interstate
-- compact that lets a psychologist holding an Authority to Practice
-- Interjurisdictional Telepsychology (APIT) see clients by telehealth in
-- any other participating state without a separate license there.
--
-- The set of participating states changes over time as more states join,
-- so rather than hard-coding a state list into this app (which would go
-- stale and risk misinforming a licensed clinician about where they can
-- legally practice), we capture the one fact that's actually stable and
-- self-known to the practitioner: whether *they* hold an APIT. The app
-- surfaces that as a badge/filter and links out to psypact.org for the
-- current authoritative state list, rather than asserting it itself.
alter table profiles add column psypact_participating boolean not null default false;

drop view public_directory;

create view public_directory
with (security_invoker = false) as
select
  p.id,
  p.full_name,
  p.credential_prefix,
  p.qualification_level,
  p.board_certified,
  p.primary_practice_city,
  p.primary_state,
  p.accepting_referrals,
  p.last_active_at,
  p.practice_website,
  p.contact_phone,
  p.contact_email,
  p.open_to_group_consultation,
  p.open_to_give_supervision,
  p.open_to_receive_supervision,
  p.psypact_participating,
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified';

grant select on public_directory to anon, authenticated;
