-- Settings (Product Spec v1): notification channels, digest frequency,
-- and who can see your profile.

-- The monthly one-click availability check is on by default in the spec's
-- trigger table. The digest is weekly by default; immediate emails are
-- governed by the per-trigger switches, so the old "realtime / daily"
-- digest values collapse to weekly.
alter table public.notification_preferences
  alter column email_on_availability_reminder set default true,
  alter column digest_frequency set default 'weekly';
update public.notification_preferences set digest_frequency = 'weekly' where digest_frequency in ('realtime', 'daily');

-- Hide from the directory and suggestions without leaving the network.
alter table public.profiles
  add column if not exists directory_visible boolean not null default true;

create or replace view public.public_directory with (security_invoker = true) as
 SELECT p.id,
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
   FROM profiles p
     JOIN profile_lookup_values plv ON plv.profile_id = p.id
     JOIN lookup_values lv ON lv.id = plv.lookup_value_id
  WHERE p.verification_status = 'verified'::verification_status
    AND p.account_status = 'active'
    AND p.directory_visible
    AND p.is_demo = viewer_is_demo()
    AND (p.is_demo OR has_active_licence(p.id));

create or replace function public.network_licence_states()
returns table(profile_id uuid, states text[])
language sql
stable security definer
set search_path to 'public'
as $$
  select l.profile_id, array_agg(distinct upper(trim(l.state))) as states
  from licenses l
  join profiles p on p.id = l.profile_id
  where l.status = 'active'
    and l.reviewed_at is not null
    and (l.expiration_date is null or l.expiration_date >= current_date)
    and p.verification_status = 'verified'
    and p.account_status = 'active'
    and p.directory_visible
    and p.is_demo = public.viewer_is_demo()
  group by l.profile_id;
$$;
