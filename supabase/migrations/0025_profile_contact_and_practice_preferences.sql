-- Me_Profile.txt fields not yet captured: pronoun (self-disclosure,
-- alongside sex/ethnicity/gender identity), practice website, contact
-- details, and the three "open to..." practice-preference toggles
-- (group consultation, giving supervision, receiving supervision) that
-- feed into Town Hall's group-consultation opt-out and future supervision
-- matching.
alter table profiles add column pronoun text;
alter table profiles add column practice_website text;
alter table profiles add column contact_phone text;
alter table profiles add column contact_email text;
alter table profiles add column open_to_group_consultation boolean not null default true;
alter table profiles add column open_to_give_supervision boolean not null default false;
alter table profiles add column open_to_receive_supervision boolean not null default false;

-- Recreate the directory view to surface the practice-facing fields
-- (website, phone, email, and the three preference toggles) - this is a
-- professional directory in the same spirit as a Psychology Today listing,
-- and every column here was explicitly named in the spec's own "Profile
-- Display" column. Pronoun is left out of the directory (self-disclosure,
-- shown only on the person's own profile), matching how ethnicity/gender
-- identity are handled elsewhere in the app.
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
  lv.category,
  lv.value,
  plv.rank
from profiles p
join profile_lookup_values plv on plv.profile_id = p.id
join lookup_values lv on lv.id = plv.lookup_value_id
where p.verification_status = 'verified';

grant select on public_directory to anon, authenticated;
