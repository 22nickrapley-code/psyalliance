-- Sept 23 audit (task in the "add missing structured criteria" bucket):
-- referral_requests already had insurance/age_band/modality columns from
-- earlier work, but the Referrals create form (requests/page.tsx) never
-- exposed them - a requester could only specify specialism, city, and
-- state, pushing everything else (language needed, session type, how
-- soon) into the free-text notes field. This adds the two remaining
-- structured fields that have an existing lookup_values taxonomy to reuse
-- (language, session_type - same category names already used for profile
-- self-disclosure and matching, see src/lib/server-matching.ts), plus a
-- small fixed-option timeframe column for "how soon," which has no
-- existing equivalent anywhere in the schema.

alter table referral_requests
  add column if not exists language_lookup_id bigint references lookup_values(id),
  add column if not exists session_type_lookup_id bigint references lookup_values(id),
  add column if not exists timeframe text check (timeframe in ('urgent', 'within_month', 'flexible'));

comment on column referral_requests.language_lookup_id is
  'Client-facing language needed, from lookup_values(category=''language'') - same taxonomy used for profile self-disclosure.';
comment on column referral_requests.session_type_lookup_id is
  'Session type needed (e.g. telehealth/in-person), from lookup_values(category=''session_type'') - same taxonomy used for profile self-disclosure and matching in server-matching.ts.';
comment on column referral_requests.timeframe is
  'How soon the referral is needed: urgent (this week), within_month, or flexible. No existing taxonomy covered this, so it is a small fixed set rather than a new lookup_values category.';
