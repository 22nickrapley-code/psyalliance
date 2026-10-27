-- 0119: v13 sandbox.
--
-- The sandbox is the real workspace on the demo site, signed in as a fictional
-- guest, "Rachel Davis" (a psychologist in Boston licensed in MA, NY and VT),
-- the same person the guided demos show. Every guest gets a private copy of
-- one story, made through the same database functions the screens call
-- (so the states it shows are states the product can really reach), then
-- dated backwards so the story already has a past:
--
--   Cover:      Fall leave (one client ready, one agreed but not yet "Handover
--               ready", one waiting on a question, so the sequence is paused),
--               Conference week (sequential, waiting on the first colleague),
--               a finished Summer plan, and two plans from colleagues that ask
--               Rachel (one open request, one she agreed, one fully ready).
--   Referrals:  one with an interested colleague, one waiting, one declined,
--               one placed 30 days ago; one asking Rachel; one she took.
--   Messages:   a Cover conversation and a Referral conversation with the same
--               colleague kept apart, direct conversations, unread counts.
--   Consult:    questions to different audiences (trusted, group, whole
--               network), replies, a follow.
--   Colleagues: 18 named colleagues with varied licences, settings and
--               availability dates (two past 90 days), in the four tiers.
--
-- Nothing here reaches a real person: the guest and every colleague are
-- fictional demo profiles on the demo site only, e-mail to them is never sent
-- (the outbox skips demo profiles and ".test" addresses), and each guest's
-- rows are listed so reset and expiry remove exactly those.
-- Run in the sandbox Supabase project only, after 0118. The live site never
-- calls these functions (they refuse unless app_env is 'demo').

-- 1. Acting as a member while seeding -------------------------------------------------
-- The v13 functions read the signed-in member from the request's JWT claims.
-- Seeding sets them for the rest of the transaction, member by member, and puts
-- them back at the end (private.demo_restore).
create or replace function private.demo_as(p_member uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_member, 'role', 'authenticated', 'aud', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', coalesce(p_member::text, ''), true);
$function$;
revoke all on function private.demo_as(uuid) from public, anon, authenticated;

create or replace function private.demo_restore(p_claims text, p_sub text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select set_config('request.jwt.claims', coalesce(p_claims, ''), true),
         set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
$function$;
revoke all on function private.demo_restore(text, text) from public, anon, authenticated;

-- Everything a story step created in this transaction carries this
-- transaction's timestamp; moving it back by an age gives the story a past.
-- Called right after each step, before the next one is made.
create or replace function private.demo_shift(p_age interval)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t timestamptz := now();
  c text := current_setting('request.jwt.claims', true);
  s text := current_setting('request.jwt.claim.sub', true);
begin
  -- Moving a message's date is a system change, not something its author does.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update coverage_plans set created_at = created_at - p_age where created_at = t;
  update coverage_plans set completed_at = completed_at - p_age where completed_at = t;
  update coverage_plan_cases set created_at = created_at - p_age where created_at = t;
  update coverage_plan_cases set handover_confirmed_at = handover_confirmed_at - p_age where handover_confirmed_at = t;
  update coverage_requests set sent_at = sent_at - p_age where sent_at = t;
  update coverage_requests set responded_at = responded_at - p_age where responded_at = t;
  update coverage_plan_events set created_at = created_at - p_age where created_at = t;
  update professional_events set created_at = created_at - p_age where created_at = t;
  update notification_events set created_at = created_at - p_age where created_at = t;
  update notification_deliveries set created_at = created_at - p_age where created_at = t;
  update notification_deliveries set delivered_at = delivered_at - p_age where delivered_at = t;
  update notification_deliveries set send_after = send_after - p_age where send_after = t;
  update notification_deliveries set read_at = read_at - p_age where read_at = t;
  update conversations set created_at = created_at - p_age where created_at = t;
  update conversations set last_message_at = last_message_at - p_age where last_message_at = t;
  update conversation_messages set created_at = created_at - p_age where created_at = t;
  update conversation_participants set joined_at = joined_at - p_age where joined_at = t;
  update conversation_participants set last_read_at = last_read_at - p_age where last_read_at = t;
  update referral_requests set created_at = created_at - p_age where created_at = t;
  update referral_requests set closed_at = closed_at - p_age where closed_at = t;
  update referral_responses set created_at = created_at - p_age where created_at = t;
  update referral_responses set responded_at = responded_at - p_age where responded_at = t;
  update referral_responses set capacity_confirmed_at = capacity_confirmed_at - p_age where capacity_confirmed_at = t;
  update referral_recipients set sent_at = sent_at - p_age where sent_at = t;
  update consultations set created_at = created_at - p_age where created_at = t;
  update consultations set resolved_at = resolved_at - p_age where resolved_at = t;
  update consultation_responses set created_at = created_at - p_age where created_at = t;
  update consultation_follows set created_at = created_at - p_age where created_at = t;
  update trusted_colleagues set created_at = created_at - p_age where created_at = t;
  perform set_config('request.jwt.claims', coalesce(c, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(s, ''), true);
end;
$function$;
revoke all on function private.demo_shift(interval) from public, anon, authenticated;

-- 2. The cast -------------------------------------------------------------------------
-- The 18 colleagues of the approved design, with their licences, settings,
-- availability and tier. Names, places, credentials, licences and openness are
-- the approved sample's. Where the sample used a label that is not one of the
-- product's own choice lists (a specialty, an insurer, a modality), the nearest
-- product value is used: "Relationships" is "Marriage & Divorce", "Autism/PDD"
-- is "Autism", the sample's insurers map to Aetna and Blue Cross Blue Shield
-- (two have no product equivalent and are left out), and "Cognitive/Behavioral"
-- is "Cognitive Behavioral Therapy (CBT)".

create or replace function private.demo_cast()
returns jsonb
language sql
immutable
as $fn$
  select $c$[{"key":"rena","name":"Rena Mitchell","qual":"PhD","state":"MA","city":"Boston","licenses":{"MA":{"virtual":true,"inPerson":true,"city":"Boston"},"NY":{"virtual":true,"inPerson":false,"city":""},"VT":{"virtual":true,"inPerson":false,"city":""}},"spec":["Anxiety/Panic Disorders","Life Transitions","Burnout"],"slots":2,"days":12,"tier":0,"lang":["English","Spanish"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":true,"bio":"Rena offers a collaborative, thoughtful approach to care, with particular experience in anxiety/panic disorders and life transitions. Professional connections and clear communication are central to their practice.","avatar":"demo/f04.svg"},{"key":"maya","name":"Maya Patel","qual":"PsyD","state":"NY","city":"Brooklyn","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Brooklyn"},"MA":{"virtual":true,"inPerson":false,"city":""},"NJ":{"virtual":true,"inPerson":false,"city":""}},"spec":["Trauma/PTSD","Depression","Anxiety/Panic Disorders"],"slots":3,"days":8,"tier":0,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"Maya offers a collaborative, thoughtful approach to care, with particular experience in trauma/ptsd and depression. Professional connections and clear communication are central to their practice.","avatar":"demo/f05.svg"},{"key":"sophie","name":"Sophie Chen","qual":"PhD","state":"CT","city":"New Haven","licenses":{"CT":{"virtual":true,"inPerson":true,"city":"New Haven"},"MA":{"virtual":true,"inPerson":false,"city":""},"RI":{"virtual":true,"inPerson":false,"city":""}},"spec":["Marriage & Divorce","Trauma/PTSD","Life Transitions"],"slots":2,"days":21,"tier":0,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":false,"bio":"Sophie offers a collaborative, thoughtful approach to care, with particular experience in relationships and trauma/ptsd. Professional connections and clear communication are central to their practice.","avatar":"demo/f06.svg"},{"key":"imani","name":"Imani Ambershaw","qual":"PhD","state":"NY","city":"Queens","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Queens"},"CT":{"virtual":true,"inPerson":false,"city":""}},"spec":["Obsessive/Compulsive Disorder","Anxiety/Panic Disorders","ADHD"],"slots":1,"days":6,"tier":0,"lang":["English","Spanish"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"Imani offers a collaborative, thoughtful approach to care, with particular experience in obsessive/compulsive disorder and anxiety/panic disorders. Professional connections and clear communication are central to their practice.","avatar":"demo/f07.svg"},{"key":"alex","name":"Alex Morgan","qual":"PsyD","state":"MA","city":"Cambridge","licenses":{"MA":{"virtual":true,"inPerson":true,"city":"Cambridge"},"VT":{"virtual":true,"inPerson":false,"city":""},"NY":{"virtual":true,"inPerson":false,"city":""}},"spec":["Anxiety/Panic Disorders","Burnout","ADHD"],"slots":3,"days":18,"tier":1,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":true,"bio":"Alex offers a collaborative, thoughtful approach to care, with particular experience in anxiety/panic disorders and burnout. Professional connections and clear communication are central to their practice.","avatar":"demo/m10.svg"},{"key":"james","name":"James Wilson","qual":"PhD","state":"NY","city":"Albany","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Albany"},"VT":{"virtual":true,"inPerson":false,"city":""}},"spec":["Depression","Grief/Loss","Chronic Illness"],"slots":2,"days":96,"tier":1,"lang":["English","French"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"James offers a collaborative, thoughtful approach to care, with particular experience in depression and grief/loss. Professional connections and clear communication are central to their practice.","avatar":"demo/m11.svg"},{"key":"eli","name":"Eli Kestrelby","qual":"MD","state":"NY","city":"Manhattan","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Manhattan"},"MA":{"virtual":true,"inPerson":false,"city":""},"NJ":{"virtual":true,"inPerson":false,"city":""}},"spec":["ADHD","Depression","Bipolar Disorder"],"slots":2,"days":9,"tier":1,"lang":["English","Spanish"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":false,"bio":"Eli offers a collaborative, thoughtful approach to care, with particular experience in adhd and depression. Professional connections and clear communication are central to their practice.","avatar":"demo/m12.svg"},{"key":"elena","name":"Elena Rivera","qual":"PhD","state":"MA","city":"Worcester","licenses":{"MA":{"virtual":true,"inPerson":true,"city":"Worcester"},"CT":{"virtual":true,"inPerson":false,"city":""},"RI":{"virtual":true,"inPerson":false,"city":""}},"spec":["Anxiety/Panic Disorders","ADHD","Behavioral Problems"],"slots":1,"days":32,"tier":2,"lang":["English"],"age":["Children","Adolescents","Young Adults"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"Elena offers a collaborative, thoughtful approach to care, with particular experience in anxiety/panic disorders and adhd. Professional connections and clear communication are central to their practice.","avatar":"demo/f08.svg"},{"key":"lena","name":"Lena Larkhollow","qual":"PsyD","state":"NY","city":"Albany","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Albany"},"VT":{"virtual":true,"inPerson":false,"city":""},"NJ":{"virtual":true,"inPerson":false,"city":""}},"spec":["Obsessive/Compulsive Disorder","Trauma/PTSD","Chronic Illness"],"slots":2,"days":45,"tier":2,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":false,"bio":"Lena offers a collaborative, thoughtful approach to care, with particular experience in obsessive/compulsive disorder and trauma/ptsd. Professional connections and clear communication are central to their practice.","avatar":"demo/f09.svg"},{"key":"fatima","name":"Fatima Ruskmere","qual":"PsyD","state":"NY","city":"Rochester","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Rochester"},"MA":{"virtual":true,"inPerson":false,"city":""},"VT":{"virtual":true,"inPerson":false,"city":""}},"spec":["Trauma/PTSD","Chronic Illness","Grief/Loss"],"slots":2,"days":16,"tier":2,"lang":["English","Spanish"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":true,"bio":"Fatima offers a collaborative, thoughtful approach to care, with particular experience in trauma/ptsd and chronic illness. Professional connections and clear communication are central to their practice.","avatar":"demo/f10.svg"},{"key":"marcus","name":"Marcus Reed","qual":"PhD","state":"VT","city":"Burlington","licenses":{"VT":{"virtual":true,"inPerson":true,"city":"Burlington"},"MA":{"virtual":true,"inPerson":false,"city":""}},"spec":["Depression","Burnout","Life Transitions"],"slots":2,"days":11,"tier":2,"lang":["English","French"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":true,"bio":"Marcus offers a collaborative, thoughtful approach to care, with particular experience in depression and burnout. Professional connections and clear communication are central to their practice.","avatar":"demo/m13.svg"},{"key":"nora","name":"Nora Ivelmoor","qual":"PsyD","state":"NY","city":"Rochester","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Rochester"},"NJ":{"virtual":true,"inPerson":false,"city":""},"CT":{"virtual":true,"inPerson":false,"city":""}},"spec":["ADHD","Anxiety/Panic Disorders","Autism"],"slots":4,"days":29,"tier":3,"lang":["English"],"age":["Children","Adolescents","Young Adults","Adults"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"Nora offers a collaborative, thoughtful approach to care, with particular experience in adhd and anxiety/panic disorders. Professional connections and clear communication are central to their practice.","avatar":"demo/f11.svg"},{"key":"talia","name":"Talia Kellingsby","qual":"MD","state":"NY","city":"Queens","licenses":{"NY":{"virtual":true,"inPerson":true,"city":"Queens"},"MA":{"virtual":true,"inPerson":false,"city":""},"CT":{"virtual":true,"inPerson":false,"city":""}},"spec":["ADHD","Depression","Anxiety/Panic Disorders"],"slots":3,"days":24,"tier":3,"lang":["English","Spanish"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":false,"bio":"Talia offers a collaborative, thoughtful approach to care, with particular experience in adhd and depression. Professional connections and clear communication are central to their practice.","avatar":"demo/f12.svg"},{"key":"daniel","name":"Daniel Park","qual":"PhD","state":"NJ","city":"Jersey City","licenses":{"NJ":{"virtual":true,"inPerson":true,"city":"Jersey City"},"NY":{"virtual":true,"inPerson":false,"city":""}},"spec":["Eating Disorders","Anxiety/Panic Disorders","Depression"],"slots":1,"days":5,"tier":3,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":true,"bio":"Daniel offers a collaborative, thoughtful approach to care, with particular experience in eating disorders and anxiety/panic disorders. Professional connections and clear communication are central to their practice.","avatar":"demo/m14.svg"},{"key":"olivia","name":"Olivia Bennett","qual":"PsyD","state":"RI","city":"Providence","licenses":{"RI":{"virtual":true,"inPerson":true,"city":"Providence"},"MA":{"virtual":true,"inPerson":false,"city":""},"CT":{"virtual":true,"inPerson":false,"city":""}},"spec":["Life Transitions","Family","Marriage & Divorce"],"slots":2,"days":64,"tier":3,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":false,"bio":"Olivia offers a collaborative, thoughtful approach to care, with particular experience in life transitions and family. Professional connections and clear communication are central to their practice.","avatar":"demo/f13.svg"},{"key":"andrew","name":"Andrew Brooks","qual":"PhD","state":"VT","city":"Montpelier","licenses":{"VT":{"virtual":true,"inPerson":true,"city":"Montpelier"},"MA":{"virtual":true,"inPerson":false,"city":""},"NY":{"virtual":true,"inPerson":false,"city":""}},"spec":["Chronic Illness","Health & Wellness","Depression"],"slots":0,"days":20,"tier":3,"lang":["English","Spanish"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"Andrew offers a collaborative, thoughtful approach to care, with particular experience in chronic illness and health & wellness. Professional connections and clear communication are central to their practice.","avatar":"demo/m15.svg"},{"key":"leila","name":"Leila Hassan","qual":"PhD","state":"CT","city":"Hartford","licenses":{"CT":{"virtual":true,"inPerson":true,"city":"Hartford"},"NY":{"virtual":true,"inPerson":false,"city":""},"RI":{"virtual":true,"inPerson":false,"city":""}},"spec":["Trauma/PTSD","Child Abuse & Neglect","Anxiety/Panic Disorders"],"slots":2,"days":17,"tier":3,"lang":["English"],"age":["Children","Adolescents","Young Adults","Adults"],"ins":["Aetna","Blue Cross Blue Shield","Medicare"],"mod":["Cognitive Behavioral Therapy (CBT)","Humanistic"],"psypact":false,"bio":"Leila offers a collaborative, thoughtful approach to care, with particular experience in trauma/ptsd and child abuse & neglect. Professional connections and clear communication are central to their practice.","avatar":"demo/f14.svg"},{"key":"ben","name":"Ben Walker","qual":"DO","state":"MA","city":"Boston","licenses":{"MA":{"virtual":true,"inPerson":true,"city":"Boston"},"VT":{"virtual":true,"inPerson":false,"city":""},"RI":{"virtual":true,"inPerson":false,"city":""}},"spec":["Depression","Bipolar Disorder","ADHD"],"slots":2,"days":92,"tier":3,"lang":["English"],"age":["Young Adults","Adults","Seniors"],"ins":["Aetna","Blue Cross Blue Shield","Medicaid"],"mod":["Psychodynamic","Contemplative"],"psypact":false,"bio":"Ben offers a collaborative, thoughtful approach to care, with particular experience in depression and bipolar disorder. Professional connections and clear communication are central to their practice.","avatar":"demo/m16.svg"}]$c$::jsonb;
$fn$;
revoke all on function private.demo_cast() from public, anon, authenticated;

-- Creates the cast on first use, then brings each one to the sample's values
-- (including "last confirmed N days ago", so the 90-day rule is always shown
-- against today). Returns {key: profile id}. Shared by every guest and safe
-- to run again.
create or replace function private.seed_demo_cast()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  c jsonb; pid uuid; out jsonb := '{}'::jsonb; st text; lic jsonb; n integer := 0;
  slots integer; q text; face boolean; states text[];
begin
  perform set_config('pa.seeding', 'on', true);
  for c in select * from jsonb_array_elements(private.demo_cast()) loop
    select p.id into pid from profiles p where p.is_demo and p.full_name = c ->> 'name' order by p.created_at limit 1;
    if pid is null then
      pid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', pid, 'authenticated', 'authenticated',
        'cast-' || (c ->> 'key') || '@seed.psyalliance.test', crypt(gen_random_uuid()::text, gen_salt('bf', 4)), now(),
        '{"provider":"email","providers":["email"],"created_by_system":"true"}'::jsonb, '{}'::jsonb, false, false,
        now() - interval '300 days', now());
      insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified,
                            verification_status, verified_at, is_demo, account_status, account_kind, directory_visible, created_at)
      values (pid, c ->> 'name', 'Dr.', (c ->> 'qual')::qualification_level, c ->> 'state', c ->> 'city', array[c ->> 'state'],
              'verified', now() - interval '200 days', true, 'active', 'clinician', true, now() - interval '300 days');
    end if;
    slots := (c ->> 'slots')::integer;
    select coalesce(array_agg(k order by (k <> c ->> 'state'), k), array[c ->> 'state']) into states from jsonb_object_keys(c -> 'licenses') k;
    select exists (select 1 from jsonb_each(c -> 'licenses') e where (e.value ->> 'inPerson')::boolean) into face;
    update profiles set
      full_name = c ->> 'name', credential_prefix = 'Dr.', qualification_level = (c ->> 'qual')::qualification_level,
      primary_state = c ->> 'state', primary_practice_city = c ->> 'city', states_qualified = states,
      verification_status = 'verified', verified_at = coalesce(verified_at, now() - interval '200 days'),
      account_status = 'active', is_demo = true, directory_visible = true, last_active_at = now() - interval '1 day',
      avatar_path = c ->> 'avatar', bio = c ->> 'bio', psypact_participating = (c ->> 'psypact')::boolean,
      referral_availability = case when slots >= 2 then 'yes' when slots = 1 then 'limited' else 'no' end,
      accepting_referrals = slots > 0, approx_spaces = slots,
      coverage_availability = 'yes', consultation_availability = 'yes', open_to_group_consultation = true,
      availability_paused_until = null,
      availability_confirmed_at = now() - make_interval(days => (c ->> 'days')::integer)
    where id = pid;

    delete from profile_lookup_values v using lookup_values lv
     where v.profile_id = pid and lv.id = v.lookup_value_id
       and lv.category in ('treatment_specialism', 'age_group_specialism', 'language', 'insurance', 'treatment_modality', 'session_type');
    insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, lv.id, s.o::integer from jsonb_array_elements_text(c -> 'spec') with ordinality s(v, o)
        join lookup_values lv on lv.category = 'treatment_specialism' and lv.value = s.v;
    insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, lv.id, null from (
        select 'age_group_specialism' cat, x v from jsonb_array_elements_text(c -> 'age') x
        union all select 'language', x from jsonb_array_elements_text(c -> 'lang') x
        union all select 'insurance', x from jsonb_array_elements_text(c -> 'ins') x
        union all select 'treatment_modality', x from jsonb_array_elements_text(c -> 'mod') x
        union all select 'session_type', 'Virtual'
        union all select 'session_type', 'Face to Face' where face) w
        join lookup_values lv on lv.category = w.cat and lv.value = w.v
      on conflict do nothing;

    delete from licenses where profile_id = pid;
    for st, lic in select e.key, e.value from jsonb_each(c -> 'licenses') e loop
      insert into licenses (profile_id, state, license_number, license_type, status, issued_date, expiration_date, notes, reviewed_at)
      values (pid, st, 'DEMO-' || st || '-' || upper(substr(replace(pid::text, '-', ''), 1, 6)),
              case when c ->> 'qual' in ('MD', 'DO') then 'Physician' else 'Licensed Psychologist' end, 'active',
              current_date - (700 + (abs(hashtext(pid::text || st)) % 2000)), current_date + (260 + (abs(hashtext(st || pid::text)) % 500)),
              'Fictional demo license', now());
    end loop;
    delete from profile_state_settings where profile_id = pid;
    insert into profile_state_settings (profile_id, state, virtual, in_person, city)
      select pid, e.key, coalesce((e.value ->> 'virtual')::boolean, false), coalesce((e.value ->> 'inPerson')::boolean, false), nullif(e.value ->> 'city', '')
        from jsonb_each(c -> 'licenses') e;
    out := out || jsonb_build_object(c ->> 'key', pid);
    n := n + 1;
  end loop;
  perform set_config('pa.seeding', '', true);
  return out;
end;
$fn$;
revoke all on function private.seed_demo_cast() from public, anon, authenticated;

-- 3. The guest's story -----------------------------------------------------------------
create or replace function private.demo_discussions()
returns jsonb language sql immutable as $fn$ select $j$[{"n":1,"author":"maya","title":"How are you approaching burnout in high-functioning adults?","body":"I’m interested in how colleagues distinguish sustained burnout from anxiety presentations in high-functioning adults. What approaches have you found useful in shaping the initial formulation?","topic":"Clinical practice","aud":"trusted","hours":0.4,"replies":[{"p":"rena","t":"I’ve found that exploring what recovery actually looks like for the person opens up a useful conversation about expectations and capacity.","h":1},{"p":"maya","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"sophie","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"imani","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4}]},{"n":2,"author":"alex","title":"Making space for reflective practice in a busy week","body":"With a busy practice, reflective time is often the first thing to go. I’d love to hear how others protect space for reflection and peer support.","topic":"Professional life","aud":"network","hours":1,"replies":[{"p":"maya","t":"A standing fortnightly conversation with a trusted colleague has made a real difference for me.","h":1},{"p":"sophie","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"imani","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"alex","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4},{"p":"james","t":"A shared formulation can be a useful place to begin. I try to keep checking that our understanding still fits the person’s experience.","h":5}]},{"n":3,"author":"sophie","title":"Resources for supporting clients through life transitions","body":"Does anyone have practical, accessible resources they use when supporting adults through significant transitions? I’m especially interested in values-based exercises.","topic":"Resources","aud":"group","hours":2,"replies":[{"p":"sophie","t":"Values card sorting can be a helpful starting point. I tend to follow it with a discussion about one small, meaningful action.","h":1},{"p":"imani","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"alex","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"james","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4},{"p":"eli","t":"A shared formulation can be a useful place to begin. I try to keep checking that our understanding still fits the person’s experience.","h":5},{"p":"elena","t":"I appreciate the different perspectives in this thread. The reminder to stay curious feels particularly relevant.","h":6}]},{"n":4,"author":"rena","title":"Building a reliable circle of cover colleagues","body":"What has helped you build a dependable group of colleagues for planned time away? I’m curious about both the practical arrangements and the conversations that establish trust.","topic":"Professional life","aud":"network","hours":3,"replies":[{"p":"imani","t":"A brief introductory conversation before an arrangement is needed helps everyone understand working styles and expectations.","h":1},{"p":"alex","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"james","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"eli","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4}]},{"n":5,"author":"elena","title":"Engaging young adults in collaborative goal setting","body":"I’d welcome ideas for keeping goal setting collaborative and relevant when working with young adults, particularly when their priorities are changing.","topic":"Clinical practice","aud":"group","hours":4,"replies":[{"p":"alex","t":"I revisit goals conversationally rather than making it a separate formal exercise. It often feels more natural.","h":1},{"p":"james","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"eli","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"elena","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4},{"p":"lena","t":"A shared formulation can be a useful place to begin. I try to keep checking that our understanding still fits the person’s experience.","h":5}]},{"n":6,"author":"james","title":"What makes a peer consultation group work well?","body":"I’m setting up a small peer consultation group and would appreciate suggestions on format, boundaries and how to keep meetings useful for everyone.","topic":"Consultation","aud":"network","hours":26,"replies":[{"p":"james","t":"A simple charter covering confidentiality, attendance and how time is shared was a helpful foundation for our group.","h":1},{"p":"eli","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"elena","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"lena","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4},{"p":"fatima","t":"A shared formulation can be a useful place to begin. I try to keep checking that our understanding still fits the person’s experience.","h":5},{"p":"marcus","t":"I appreciate the different perspectives in this thread. The reminder to stay curious feels particularly relevant.","h":6}]},{"n":7,"author":"maya","title":"Small changes that have improved your practice this year","body":"Which small operational changes have had the most positive impact on your practice this year?","topic":"Professional life","aud":"group","hours":26,"replies":[{"p":"eli","t":"A clearer process for cover and referrals has reduced the background work considerably.","h":1},{"p":"elena","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"lena","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"fatima","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4}]},{"n":8,"author":"alex","title":"A conversation about professional isolation","body":"How do you stay connected to colleagues when working independently?","topic":"Community","aud":"network","hours":26,"replies":[{"p":"elena","t":"Regular consultation and a few reliable connections go a long way.","h":1},{"p":"lena","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"fatima","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"marcus","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4},{"p":"nora","t":"A shared formulation can be a useful place to begin. I try to keep checking that our understanding still fits the person’s experience.","h":5}]},{"n":9,"author":"sophie","title":"Sharing helpful ACT reading for colleagues","body":"I’m putting together a short reading list for colleagues interested in ACT. What would you include?","topic":"Resources","aud":"group","hours":50,"replies":[{"p":"lena","t":"I would start with accessible introductory material and a couple of practical exercises.","h":1},{"p":"fatima","t":"That distinction is helpful. I also find it useful to ask what the person hopes will be different outside the therapy room.","h":2},{"p":"marcus","t":"The practical context matters here. I would be interested in how colleagues make room for this conversation during the first few meetings.","h":3},{"p":"nora","t":"Thank you for raising this. It is a topic I would welcome bringing to our next peer consultation.","h":4},{"p":"talia","t":"A shared formulation can be a useful place to begin. I try to keep checking that our understanding still fits the person’s experience.","h":5},{"p":"daniel","t":"I appreciate the different perspectives in this thread. The reminder to stay curious feels particularly relevant.","h":6}]}]$j$::jsonb; $fn$;
revoke all on function private.demo_discussions() from public, anon, authenticated;

create or replace function private.demo_threads()
returns jsonb language sql immutable as $fn$ select $j$[{"key":"rena-cover","person":"rena","type":"Cover","unread":2,"msgs":[{"own":false,"t":"Hi Rachel! Thanks for sharing your cover plan. I’ve had a look and the dates work well for me.","at":"10:28"},{"own":true,"t":"That’s great, Rena. It would be lovely to have you as my cover colleague again.","at":"10:31"},{"own":false,"t":"Of course. I can cover both weeks. Shall we arrange a quick handover before you go?","at":"10:34"},{"own":true,"t":"Absolutely. Would Thursday afternoon work for you? I’ll make sure everything is ready beforehand.","at":"10:38"},{"own":false,"t":"Thursday works perfectly. Looking forward to catching up!","at":"10:42"}]},{"key":"maya-referral","person":"maya","type":"Referral","unread":1,"msgs":[{"own":false,"t":"Hi Rachel, thanks for thinking of me. I have availability for an adult anxiety referral in New York.","at":"09:50"},{"own":true,"t":"Thank you, Maya. Weekly virtual sessions would be ideal. Would that fit your current availability?","at":"09:53"},{"own":false,"t":"Yes, I have a Tuesday afternoon opening. Happy to discuss the next step.","at":"09:56"}]},{"key":"alex-direct","person":"alex","type":"Direct","unread":0,"msgs":[{"own":false,"t":"Great to connect here, Rachel. I enjoyed our conversation about building a dependable local network.","at":"16:12"},{"own":true,"t":"Likewise, Alex. It’s good to have colleagues nearby to exchange ideas with.","at":"16:20"}]},{"key":"sophie-consult","person":"sophie","type":"Consult","unread":0,"msgs":[{"own":false,"t":"Our next peer consultation is Thursday at 12. I’ll share the discussion outline in the group beforehand.","at":"14:10"},{"own":true,"t":"Thanks Sophie, I’m looking forward to it.","at":"14:19"}]},{"key":"james-direct","person":"james","type":"Direct","unread":0,"msgs":[{"own":false,"t":"Thanks for the resource recommendation. I found it really useful.","at":"11:15"}]}]$j$::jsonb; $fn$;
revoke all on function private.demo_threads() from public, anon, authenticated;

create or replace function private.demo_client(p_label text, p_focus text, p_state text, p_secondary text, p_setting text, p_age text, p_freq text, p_selected jsonb)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object('label', p_label, 'focus', p_focus, 'secondary', p_secondary, 'state', p_state, 'age', p_age, 'setting', p_setting,
                            'insurance', '', 'frequency', p_freq, 'prescribing', false, 'language', '', 'city', '', 'selected', p_selected);
$fn$;
revoke all on function private.demo_client(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function private.demo_case(p_plan bigint, p_label text)
returns bigint language sql stable security definer set search_path to 'public' as $fn$
  select c.id from coverage_plan_cases c where c.coverage_plan_id = p_plan and c.case_reference = p_label order by c.id limit 1;
$fn$;
revoke all on function private.demo_case(bigint, text) from public, anon, authenticated;

create or replace function private.demo_req(p_plan bigint, p_label text, p_person uuid)
returns bigint language sql stable security definer set search_path to 'public' as $fn$
  select r.id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id
   where c.coverage_plan_id = p_plan and c.case_reference = p_label and r.requested_profile_id = p_person order by r.id desc limit 1;
$fn$;
revoke all on function private.demo_req(bigint, text, uuid) from public, anon, authenticated;

-- An open request carries its own deadline, counted from when it was asked.
create or replace function private.demo_open_clock(p_plan bigint, p_asked_ago interval)
returns void language sql security definer set search_path to 'public' as $fn$
  update coverage_requests r
     set sent_at = now() - p_asked_ago, expires_at = now() - p_asked_ago + make_interval(hours => coalesce(pl.response_hours, 48))
    from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
   where c.id = r.coverage_plan_case_id and pl.id = p_plan and r.status = 'sent';
$fn$;
revoke all on function private.demo_open_clock(bigint, interval) from public, anon, authenticated;

-- A conversation's messages, ending a given time ago, spaced apart; the member
-- has read everything except the last few from the other person.
create or replace function private.demo_thread(p_conv bigint, p_msgs jsonb, p_viewer uuid, p_other uuid, p_end_ago interval, p_gap interval, p_unread integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare i integer; n integer := jsonb_array_length(p_msgs); m jsonb; at timestamptz; inc timestamptz[] := '{}'; boundary timestamptz;
begin
  for i in 0 .. n - 1 loop
    m := p_msgs -> i;
    at := now() - p_end_ago - p_gap * (n - 1 - i);
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (p_conv, case when (m ->> 'own')::boolean then p_viewer else p_other end, m ->> 't', at);
    if not (m ->> 'own')::boolean then inc := inc || at; end if;
  end loop;
  update conversations set last_message_at = now() - p_end_ago where id = p_conv;
  if p_unread > 0 and coalesce(array_length(inc, 1), 0) >= p_unread then
    boundary := inc[array_length(inc, 1) - p_unread + 1] - interval '1 second';
  else
    boundary := now() - p_end_ago + interval '1 second';
  end if;
  update conversation_participants set last_read_at = boundary where conversation_id = p_conv and profile_id = p_viewer;
  update conversation_participants set last_read_at = now() where conversation_id = p_conv and profile_id = p_other;
end;
$fn$;
revoke all on function private.demo_thread(bigint, jsonb, uuid, uuid, interval, interval, integer) from public, anon, authenticated;

create or replace function private.demo_conv(p_key text)
returns bigint language sql volatile security definer set search_path to 'public' as $fn$
  select c.id from conversations c where c.context_key = p_key or c.id = (case when p_key ~ '^c-[0-9]{1,18}$' then substr(p_key, 3)::bigint end) limit 1;
$fn$;
revoke all on function private.demo_conv(text) from public, anon, authenticated;

-- A guest's whole story, made fresh. Everything is made as the people involved
-- (so the product's own rules apply), then dated backwards.
create or replace function private.seed_demo_viewer(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint;
  m jsonb;
  rena uuid; maya uuid; sophie uuid; imani uuid; alex uuid; james uuid; eli uuid; elena uuid; lena uuid; fatima uuid; marcus uuid;
  nora uuid; talia uuid; daniel uuid; olivia uuid; andrew uuid; leila uuid; ben uuid;
  r jsonb;
  plan1 bigint; plan2 bigint; plan3 bigint; plan4 bigint; plan5 bigint;
  ref1 bigint; ref2 bigint; ref3 bigint; ref4 bigint;
  grp bigint; other_grp bigint; cid bigint; conv bigint; k text; d jsonb; rp jsonb; who uuid;
  i integer; age_h numeric; step_h numeric; n integer;
  tmsgs jsonb; t jsonb;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    raise exception 'The sandbox exists only on the demo site.' using errcode = 'P0001';
  end if;

  -- The guest is not yet a sandbox guest in the eyes of the network (guests
  -- are hidden from each other and from the cast); seeding needs the cast to
  -- see her, so she is shown for this one transaction.
  select s.id into pass_id from sandbox_passes s where s.guest_id = p_viewer;
  if pass_id is not null then
    update sandbox_passes set guest_id = null where id = pass_id;
  end if;

  perform private.clear_demo_viewer(p_viewer);
  -- Discussions made for this guest are visible to this guest only.
  perform set_config('pa.sandbox_owner', p_viewer::text, true);
  m := private.seed_demo_cast();
  rena := (m ->> 'rena')::uuid; maya := (m ->> 'maya')::uuid; sophie := (m ->> 'sophie')::uuid; imani := (m ->> 'imani')::uuid;
  alex := (m ->> 'alex')::uuid; james := (m ->> 'james')::uuid; eli := (m ->> 'eli')::uuid; elena := (m ->> 'elena')::uuid;
  lena := (m ->> 'lena')::uuid; fatima := (m ->> 'fatima')::uuid; marcus := (m ->> 'marcus')::uuid; nora := (m ->> 'nora')::uuid;
  talia := (m ->> 'talia')::uuid; daniel := (m ->> 'daniel')::uuid; olivia := (m ->> 'olivia')::uuid; andrew := (m ->> 'andrew')::uuid;
  leila := (m ->> 'leila')::uuid; ben := (m ->> 'ben')::uuid;

  -- Rachel Davis ---------------------------------------------------------------
  perform set_config('pa.seeding', 'on', true);
  update profiles set
    full_name = 'Rachel Davis', credential_prefix = 'Dr.', qualification_level = 'PhD', primary_state = 'MA', primary_practice_city = 'Boston',
    states_qualified = array['MA', 'NY', 'VT'], verification_status = 'verified', verified_at = coalesce(verified_at, now()),
    account_status = 'active', account_kind = 'clinician', is_demo = true, directory_visible = true, psypact_participating = false,
    bio = 'I work with adults and young adults on anxiety, low mood and the big transitions of life, mostly CBT with a humanistic base. In person in Boston and by telehealth in Massachusetts, New York and Vermont.',
    referral_availability = 'yes', accepting_referrals = true, coverage_availability = 'yes', consultation_availability = 'yes',
    open_to_group_consultation = true, approx_spaces = 2, availability_paused_until = null,
    availability_confirmed_at = now() - interval '12 days', avatar_path = null
  where id = p_viewer;
  delete from profile_lookup_values v using lookup_values lv
   where v.profile_id = p_viewer and lv.id = v.lookup_value_id
     and lv.category in ('treatment_specialism', 'age_group_specialism', 'language', 'insurance', 'treatment_modality', 'session_type');
  insert into profile_lookup_values (profile_id, lookup_value_id, rank)
    select p_viewer, lv.id, s.o::integer from unnest(array['Anxiety/Panic Disorders', 'Depression', 'Life Transitions']) with ordinality s(v, o)
      join lookup_values lv on lv.category = 'treatment_specialism' and lv.value = s.v;
  insert into profile_lookup_values (profile_id, lookup_value_id, rank)
    select p_viewer, lv.id, null from (values
      ('age_group_specialism', 'Adults'), ('age_group_specialism', 'Young Adults'), ('language', 'English'),
      ('insurance', 'Aetna'), ('insurance', 'Blue Cross Blue Shield'), ('insurance', 'Medicare'),
      ('treatment_modality', 'Cognitive Behavioral Therapy (CBT)'), ('treatment_modality', 'Humanistic'),
      ('session_type', 'Virtual'), ('session_type', 'Face to Face')) w(cat, v)
      join lookup_values lv on lv.category = w.cat and lv.value = w.v
    on conflict do nothing;
  delete from licenses where profile_id = p_viewer;
  insert into licenses (profile_id, state, license_number, license_type, status, issued_date, expiration_date, notes, reviewed_at)
  values (p_viewer, 'MA', 'DEMO-MA-4471', 'Licensed Psychologist', 'active', current_date - 2400, current_date + 420, 'Fictional demo license', now()),
         (p_viewer, 'NY', 'DEMO-NY-2208', 'Licensed Psychologist', 'active', current_date - 1500, current_date + 610, 'Fictional demo license', now()),
         (p_viewer, 'VT', 'DEMO-VT-0932', 'Licensed Psychologist', 'active', current_date - 900, current_date + 540, 'Fictional demo license', now());
  delete from profile_state_settings where profile_id = p_viewer;
  insert into profile_state_settings (profile_id, state, virtual, in_person, city)
  values (p_viewer, 'MA', true, true, 'Boston'), (p_viewer, 'NY', true, false, null), (p_viewer, 'VT', true, false, null);

  -- Colleagues: the four tiers ---------------------------------------------------
  -- Trusted: chosen one way by Rachel, and these four trust her back.
  insert into trusted_colleagues (profile_id, colleague_id)
  select x, y from (values (p_viewer, rena), (p_viewer, maya), (p_viewer, sophie), (p_viewer, imani),
                           (rena, p_viewer), (maya, p_viewer), (sophie, p_viewer), (imani, p_viewer)) v(x, y)
  on conflict do nothing;
  insert into trusted_colleagues (profile_id, colleague_id)
  select x, y from (values (maya, rena), (maya, sophie), (maya, imani), (sophie, rena), (sophie, maya), (sophie, imani),
                           (rena, maya), (rena, sophie), (imani, maya), (imani, rena)) v(x, y)
  on conflict do nothing;
  perform private.demo_shift(interval '210 days');
  -- Suggested by PsyAlliance.
  delete from suggested_colleagues where profile_id = p_viewer;
  insert into suggested_colleagues (profile_id, colleague_id, position)
  values (p_viewer, elena, 1), (p_viewer, lena, 2), (p_viewer, fatima, 3), (p_viewer, marcus, 4);
  -- Worked with before, beyond the cover and referrals below.
  insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, created_at)
  values ('collaboration_established', james, 'member_web', p_viewer, 'Demo activity', now() - interval '80 days'),
         ('referral_outcome', eli, 'member_web', p_viewer, 'Demo activity', now() - interval '45 days');

  -- Cover ----------------------------------------------------------------------
  -- Fall leave: three clients, three different places in the same plan.
  perform private.demo_as(p_viewer);
  r := public.cover_create_plan(jsonb_build_object(
    'requestId', gen_random_uuid(), 'name', 'Fall leave cover', 'reason', 'short', 'other', '',
    'start', to_char(current_date + 7, 'YYYY-MM-DD'), 'end', to_char(current_date + 18, 'YYYY-MM-DD'),
    'mode', 'sequential', 'deadline', 48, 'message', 'Weekly appointments. Happy to arrange a handover before I go.',
    'clients', jsonb_build_array(
      private.demo_client('Client 1', 'Anxiety/Panic Disorders', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(rena, alex)),
      private.demo_client('Client 2', 'Depression', 'NY', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(maya, james)),
      private.demo_client('Client 3', 'Trauma/PTSD', 'CT', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(sophie, leila)))));
  plan1 := (r ->> 'planId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: a colleague was dropped from Fall leave: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan1, p_viewer);
  perform private.demo_shift(interval '2 days');
  perform private.demo_as(rena);
  perform public.cover_answer(private.demo_req(plan1, 'Client 1', rena), 'accepted');
  perform private.demo_shift(interval '44 hours');
  perform private.demo_as(maya);
  perform public.cover_answer(private.demo_req(plan1, 'Client 2', maya), 'accepted');
  perform private.demo_shift(interval '30 hours');
  perform private.demo_as(sophie);
  perform public.cover_answer(private.demo_req(plan1, 'Client 3', sophie), 'discussing',
    'Could we talk through Client 3 before I decide? I want to be sure Thursday evenings are workable for them.', md5('seed-cover-q-' || plan1)::uuid);
  perform private.demo_shift(interval '26 hours');
  perform private.demo_as(p_viewer);
  perform public.cover_confirm_handover(plan1, private.demo_case(plan1, 'Client 1'), true, true, true);
  perform private.demo_shift(interval '20 hours');

  -- Conference week: waiting on the first colleague, the second is queued.
  perform private.demo_as(p_viewer);
  r := public.cover_create_plan(jsonb_build_object(
    'requestId', gen_random_uuid(), 'name', 'Conference week', 'reason', 'short', 'other', '',
    'start', to_char(current_date + 42, 'YYYY-MM-DD'), 'end', to_char(current_date + 46, 'YYYY-MM-DD'),
    'mode', 'sequential', 'deadline', 24, 'message', 'Temporary cover during a professional conference.',
    'clients', jsonb_build_array(private.demo_client('Client 1', 'Burnout', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(alex, rena)))));
  plan2 := (r ->> 'planId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: a colleague was dropped from Conference week: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan2, p_viewer);
  perform private.demo_shift(interval '1 day');
  perform private.demo_open_clock(plan2, interval '5 hours');

  -- Summer leave: finished, parallel, one colleague, handover done.
  perform private.demo_as(p_viewer);
  r := public.cover_create_plan(jsonb_build_object(
    'requestId', gen_random_uuid(), 'name', 'Summer leave cover', 'reason', 'short', 'other', '',
    'start', to_char(current_date - 78, 'YYYY-MM-DD'), 'end', to_char(current_date - 67, 'YYYY-MM-DD'),
    'mode', 'parallel', 'deadline', 48, 'message', '',
    'clients', jsonb_build_array(private.demo_client('Client 1', 'Anxiety/Panic Disorders', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(alex)))));
  plan3 := (r ->> 'planId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: a colleague was dropped from Summer leave: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan3, p_viewer);
  perform private.demo_shift(interval '100 days');
  perform private.demo_as(alex);
  perform public.cover_answer(private.demo_req(plan3, 'Client 1', alex), 'accepted');
  perform private.demo_shift(interval '98 days');
  perform private.demo_as(p_viewer);
  perform public.cover_confirm_handover(plan3, private.demo_case(plan3, 'Client 1'), true, true, true);
  perform private.demo_shift(interval '80 days');
  perform public.cover_complete_plan(plan3);
  perform private.demo_shift(interval '66 days');

  -- Alex asks Rachel about two clients: one waiting for her, one she agreed to.
  perform private.demo_as(alex);
  r := public.cover_create_plan(jsonb_build_object(
    'requestId', gen_random_uuid(), 'name', 'October practice cover', 'reason', 'unexpected', 'other', '',
    'start', to_char(current_date - 4, 'YYYY-MM-DD'), 'end', to_char(current_date + 4, 'YYYY-MM-DD'),
    'mode', 'parallel', 'deadline', 24, 'message', 'Would you be able to help with temporary cover? A brief conversation would be useful.',
    'clients', jsonb_build_array(
      private.demo_client('Client 1', 'Anxiety/Panic Disorders', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(p_viewer)),
      private.demo_client('Client 2', 'Life Transitions', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
  plan4 := (r ->> 'planId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: Rachel was dropped from October practice cover: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan4, p_viewer);
  perform private.demo_shift(interval '3 hours');
  perform private.demo_as(p_viewer);
  perform public.cover_answer(private.demo_req(plan4, 'Client 2', p_viewer), 'accepted');
  perform private.demo_shift(interval '2 hours');
  perform private.demo_open_clock(plan4, interval '3 hours');

  -- Maya's plan: Rachel agreed, Maya confirmed the handover, so it is ready.
  perform private.demo_as(maya);
  r := public.cover_create_plan(jsonb_build_object(
    'requestId', gen_random_uuid(), 'name', 'November peer cover', 'reason', 'short', 'other', '',
    'start', to_char(current_date + 10, 'YYYY-MM-DD'), 'end', to_char(current_date + 15, 'YYYY-MM-DD'),
    'mode', 'sequential', 'deadline', 48, 'message', 'Thank you for helping with cover while I’m away.',
    'clients', jsonb_build_array(private.demo_client('Client 1', 'Depression', 'NY', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
  plan5 := (r ->> 'planId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: Rachel was dropped from November peer cover: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan5, p_viewer);
  perform private.demo_shift(interval '5 days');
  perform private.demo_as(p_viewer);
  perform public.cover_answer(private.demo_req(plan5, 'Client 1', p_viewer), 'accepted');
  perform private.demo_shift(interval '4 days');
  perform private.demo_as(maya);
  perform public.cover_confirm_handover(plan5, private.demo_case(plan5, 'Client 1'), true, true, true);
  perform private.demo_shift(interval '1 day');

  -- Referrals ------------------------------------------------------------------
  -- Rachel asks three colleagues about an adult with anxiety in New York:
  -- one is interested, one has not answered, one is not available.
  perform private.demo_as(p_viewer);
  r := public.referral_create(jsonb_build_object(
    'requestId', gen_random_uuid(), 'state', 'NY', 'setting', 'virtual', 'focus', 'Anxiety/Panic Disorders', 'secondary', '', 'age', 'Adults',
    'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(maya, imani, nora),
    'timeframe', 'Within a month', 'message', 'Weekly virtual sessions, ideally in the afternoon.', 'prescribing', false));
  ref1 := (r ->> 'referralId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: a colleague was dropped from the anxiety referral: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref1, p_viewer);
  perform private.demo_shift(interval '1 day');
  perform private.demo_as(maya);
  perform public.referral_answer(ref1, 'interested', true);
  perform private.demo_shift(interval '20 hours');
  perform private.demo_as(nora);
  perform public.referral_answer(ref1, 'declined', false);
  perform private.demo_shift(interval '18 hours');

  -- Placed with Alex a month ago: "placed" is a decision, not an expression of interest.
  perform private.demo_as(p_viewer);
  r := public.referral_create(jsonb_build_object(
    'requestId', gen_random_uuid(), 'state', 'MA', 'setting', 'virtual', 'focus', 'Burnout', 'secondary', '', 'age', 'Adults',
    'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(alex),
    'timeframe', 'Within a month', 'message', '', 'prescribing', false));
  ref2 := (r ->> 'referralId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: Alex was dropped from the burnout referral: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref2, p_viewer);
  perform private.demo_shift(interval '32 days');
  perform private.demo_as(alex);
  perform public.referral_answer(ref2, 'interested', true);
  perform private.demo_shift(interval '31 days');
  perform private.demo_as(p_viewer);
  perform public.referral_place(ref2, alex);
  perform private.demo_shift(interval '30 days');

  -- Eli asks Rachel (waiting for her answer).
  perform private.demo_as(eli);
  r := public.referral_create(jsonb_build_object(
    'requestId', gen_random_uuid(), 'state', 'MA', 'setting', 'virtual', 'focus', 'Anxiety/Panic Disorders', 'secondary', 'Life Transitions', 'age', 'Adults',
    'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
    'timeframe', 'Within two weeks', 'message', 'Would welcome a colleague with availability for weekly virtual therapy.', 'prescribing', false));
  ref3 := (r ->> 'referralId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: Rachel was dropped from Eli''s referral: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref3, p_viewer);
  perform private.demo_shift(interval '40 minutes');

  -- Sophie referred a client to Rachel, who took it.
  perform private.demo_as(sophie);
  r := public.referral_create(jsonb_build_object(
    'requestId', gen_random_uuid(), 'state', 'MA', 'setting', 'virtual', 'focus', 'Depression', 'secondary', '', 'age', 'Adults',
    'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
    'timeframe', 'Within a month', 'message', '', 'prescribing', false));
  ref4 := (r ->> 'referralId')::bigint;
  if jsonb_array_length(r -> 'dropped') > 0 then raise exception 'Sandbox seed: Rachel was dropped from Sophie''s referral: %', r; end if;
  insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref4, p_viewer);
  perform private.demo_shift(interval '42 days');
  perform private.demo_as(p_viewer);
  perform public.referral_answer(ref4, 'interested', true);
  perform private.demo_shift(interval '41 days');
  perform private.demo_as(sophie);
  perform public.referral_place(ref4, p_viewer);
  perform private.demo_shift(interval '40 days');

  -- Messages -------------------------------------------------------------------
  -- Cover and Referral conversations with Maya are separate; Rena's holds the handover talk.
  tmsgs := private.demo_threads();
  perform private.demo_as(p_viewer);
  conv := private.demo_conv(public.conversation_open('cover', plan1, private.demo_case(plan1, 'Client 1'), rena) ->> 'key');
  insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer);
  for t in select * from jsonb_array_elements(tmsgs) loop
    if t ->> 'key' = 'rena-cover' then
      perform private.demo_thread(conv, t -> 'msgs', p_viewer, rena, interval '61 minutes', interval '4 minutes', (t ->> 'unread')::integer);
    end if;
  end loop;

  conv := private.demo_conv(public.conversation_open('cover', plan1, private.demo_case(plan1, 'Client 2'), maya) ->> 'key');
  insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer);
  perform private.demo_thread(conv, jsonb_build_array(
      jsonb_build_object('own', false, 't', 'Happy to take Client 2. Shall we find ten minutes to hand over before you go?')),
    p_viewer, maya, interval '25 hours', interval '1 minute', 1);

  conv := private.demo_conv(public.referral_thread(ref1, maya) ->> 'conversationKey');
  insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer);
  for t in select * from jsonb_array_elements(tmsgs) loop
    if t ->> 'key' = 'maya-referral' then
      perform private.demo_thread(conv, t -> 'msgs', p_viewer, maya, interval '19 hours', interval '3 minutes', (t ->> 'unread')::integer);
    end if;
  end loop;

  for t in select * from jsonb_array_elements(tmsgs) loop
    if t ->> 'key' in ('alex-direct', 'sophie-consult', 'james-direct') then
      who := case t ->> 'person' when 'alex' then alex when 'sophie' then sophie else james end;
      conv := private.demo_conv(public.conversation_open('direct', null, null, who) ->> 'key');
      insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer);
      perform private.demo_thread(conv, t -> 'msgs', p_viewer, who,
        case t ->> 'key' when 'james-direct' then interval '4 days' else interval '26 hours' end, interval '8 minutes', (t ->> 'unread')::integer);
    end if;
  end loop;
  -- A message she started and has not sent.
  insert into workspace_drafts (profile_id, kind, key, data)
  values (p_viewer, 'message', public.conversation_open('direct', null, null, alex) ->> 'key',
          to_jsonb('Alex, would you be open to a short call this week to talk through the October handover?'::text))
  on conflict (profile_id, kind, key) do update set data = excluded.data;

  -- Consult ------------------------------------------------------------------------
  -- Thursday Circle: Rachel and five colleagues. A second group she is not in.
  insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
  values ('Thursday Circle', 'Weekly peer consultation for clinicians working with anxiety, trauma and life transitions', sophie, 'Weekly, Thursdays', 'video',
          'Members only. Client details are always de-identified. This is consultation, not supervision: the treating clinician decides. No recording or transcription.', 2)
  returning id into grp;
  insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', grp, p_viewer);
  insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
  values (grp, sophie, 'joined', 'creator', now()), (grp, p_viewer, 'joined', 'member', now()), (grp, rena, 'joined', 'member', now()),
         (grp, alex, 'joined', 'member', now()), (grp, maya, 'joined', 'member', now()), (grp, elena, 'joined', 'member', now());
  insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
  values ('Providence peer group', 'Monthly peer consultation, Rhode Island', olivia, 'Monthly', 'video', 'Members only. Client details are always de-identified.', 1)
  returning id into other_grp;
  insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', other_grp, p_viewer);
  insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
  values (other_grp, olivia, 'joined', 'creator', now()), (other_grp, andrew, 'joined', 'member', now()), (other_grp, ben, 'joined', 'member', now());
  perform private.demo_shift(interval '40 days');

  -- The approved sample's nine discussions, oldest first.
  for d in select x from jsonb_array_elements(private.demo_discussions()) x order by (x ->> 'hours')::numeric desc loop
    who := (m ->> (d ->> 'author'))::uuid;
    perform private.demo_as(who);
    r := public.consult_post(jsonb_build_object(
      'clientRequestId', md5('seed-consult-' || p_viewer || '-' || (d ->> 'n'))::uuid, 'title', d ->> 'title', 'body', d ->> 'body',
      'topic', d ->> 'topic', 'tags', '[]'::jsonb, 'confirmed', 'true',
      'audience', d ->> 'aud', 'groupId', case when d ->> 'aud' = 'group' then grp end));
    cid := (r ->> 'id')::bigint;
    insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer);
    age_h := (d ->> 'hours')::numeric;
    perform private.demo_shift(make_interval(secs => (age_h * 3600)::integer));
    n := jsonb_array_length(d -> 'replies');
    step_h := least(0.33, greatest(0.05, (age_h - 0.05) / (n + 1)));
    i := 0;
    for rp in select x from jsonb_array_elements(d -> 'replies') x loop
      who := (m ->> (rp ->> 'p'))::uuid;
      i := i + 1;
      continue when who is null or who = (m ->> (d ->> 'author'))::uuid and false;
      continue when not private.consult_can_see(cid, who);
      perform private.demo_as(who);
      perform public.consult_reply(cid, rp ->> 't', md5('seed-reply-' || cid || '-' || i)::uuid);
      perform private.demo_shift(make_interval(secs => greatest(60, ((age_h - step_h * i) * 3600))::integer));
    end loop;
  end loop;
  -- Rachel follows the first discussion.
  perform private.demo_restore(null, null);
  insert into consultation_follows (profile_id, consultation_id)
  select p_viewer, c.id from consultations c
   where c.id in (select dr.id from private.demo_rows dr where dr.tbl = 'consultations' and dr.owner = p_viewer) and c.question = (private.demo_discussions() -> 0 ->> 'title')
  on conflict do nothing;

  -- Questions to smaller audiences: asked of a few, asked of Rachel alone; and
  -- one that Rachel is not part of (a colleague's own trusted circle).
  perform private.demo_as(james);
  r := public.consult_post(jsonb_build_object(
    'clientRequestId', md5('seed-consult-few-' || p_viewer)::uuid, 'title', 'Grief work with older adults after a spouse’s death',
    'body', 'Several clients in their seventies this year. What has helped beyond the usual grief frameworks, particularly around isolation?',
    'topic', 'Clinical practice', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'few',
    'recipients', jsonb_build_array(p_viewer, eli, elena)));
  cid := (r ->> 'id')::bigint;
  insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer);
  perform private.demo_shift(interval '9 hours');
  perform private.demo_as(lena);
  r := public.consult_post(jsonb_build_object(
    'clientRequestId', md5('seed-consult-one-' || p_viewer)::uuid, 'title', 'Would you take a look at how I word the consent for telehealth across state lines?',
    'body', 'You work across Massachusetts, New York and Vermont, so I would value your eye on my wording.',
    'topic', 'Consultation', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'one', 'recipients', jsonb_build_array(p_viewer)));
  cid := (r ->> 'id')::bigint;
  insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer);
  perform private.demo_shift(interval '5 hours');
  perform private.demo_as(andrew);
  r := public.consult_post(jsonb_build_object(
    'clientRequestId', md5('seed-consult-hidden-' || p_viewer)::uuid, 'title', 'Fees for a standing Monday evening slot',
    'body', 'Thinking about a premium for an evening slot. This is for my own trusted colleagues.',
    'topic', 'Professional life', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'trusted'));
  cid := (r ->> 'id')::bigint;
  insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer);
  perform private.demo_shift(interval '30 hours');

  -- Library: a couple of saved resources. ------------------------------------------
  perform private.demo_restore(null, null);
  insert into saved_resources (profile_id, resource_key)
  select p_viewer, d.library_code from documents d
   where d.owner_scope = 'world' and d.library_code ~ '^PA-[0-9]{2}$'
     and ((d.review_status = 'published' and d.review_date is not null) or d.review_status = 'provisional')
   order by d.library_code limit 2
  on conflict do nothing;

  -- Notifications: everything made above is history, except the four things
  -- that are waiting for Rachel (they show in her action list in any case).
  update notification_deliveries d set read_at = coalesce(d.read_at, now())
   where d.recipient_profile_id = p_viewer and d.channel = 'in_app' and d.read_at is null;
  -- Mail to demo profiles is never sent (the outbox skips them); close it here so nothing waits.
  update notification_deliveries d set status = 'suppressed_demo'
   where d.channel = 'email' and d.status = 'pending'
     and d.recipient_profile_id in (select id from profiles where is_demo);

  -- The story that follows (colleagues get in touch, one at a time).
  perform private.seed_demo_viewer_story(p_viewer);

  perform set_config('pa.seeding', '', true);
  perform set_config('pa.sandbox_owner', '', true);
  perform private.demo_restore(saved_claims, saved_sub);
  if pass_id is not null then
    update sandbox_passes set guest_id = p_viewer where id = pass_id;
  end if;
end;
$fn$;
revoke all on function private.seed_demo_viewer(uuid) from public, anon, authenticated;

-- 4. Each sandbox's discussions belong to that sandbox -----------------------------------
-- Colleagues in every sandbox are the same fictional people, so a discussion
-- one of them "posts" to the whole network or to their trusted colleagues
-- would otherwise appear in every visitor's sandbox. A discussion made for a
-- sandbox (or by its guest) carries that guest as its owner, and no other
-- guest can see it. Real accounts never have an owner, so nothing changes there.
alter table public.consultations add column if not exists sandbox_owner uuid references public.profiles(id) on delete cascade;
create index if not exists consultations_sandbox_owner_idx on public.consultations (sandbox_owner) where sandbox_owner is not null;

create or replace function private.stamp_sandbox_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare o uuid;
begin
  if new.sandbox_owner is not null or coalesce(private.cfg('app_env'), '') <> 'demo' then
    return new;
  end if;
  if private.is_sandbox_guest(new.author_profile_id) then
    new.sandbox_owner := new.author_profile_id;
  else
    begin
      o := nullif(current_setting('pa.sandbox_owner', true), '')::uuid;
    exception when others then
      o := null;
    end;
    new.sandbox_owner := o;
  end if;
  return new;
end;
$function$;
revoke all on function private.stamp_sandbox_owner() from public, anon, authenticated;
drop trigger if exists stamp_sandbox_owner on public.consultations;
create trigger stamp_sandbox_owner before insert on public.consultations
  for each row execute function private.stamp_sandbox_owner();

create or replace function private.consult_can_see(p_id bigint, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_viewer is not null and exists (
    select 1 from consultations c
     where c.id = p_id and c.status not in ('draft', 'removed')
       and (
         c.author_profile_id = p_viewer
         or (
           private.can_view_network(p_viewer)
           and private.in_viewer_partition(c.author_profile_id)
           and not public.is_blocked_between(p_viewer, c.author_profile_id)
           and (c.sandbox_owner is null or c.sandbox_owner = p_viewer or not private.is_sandbox_guest(p_viewer))
           and (
             c.audience_type = 'wider_network'
             or (c.audience_type = 'selected' and p_viewer = any (c.audience_profile_ids))
             or (c.audience_type = 'trusted' and exists (select 1 from trusted_colleagues t where t.profile_id = c.author_profile_id and t.colleague_id = p_viewer))
             or (c.group_id is not null and private.is_consultation_group_member(c.group_id, p_viewer))
           )
         )
       )
  );
$function$;
revoke all on function private.consult_can_see(bigint, uuid) from public, anon, authenticated;

alter policy "consultations are visible per their chosen audience" on public.consultations
  using (
    (status <> all (array['draft'::text, 'removed'::text]))
    and (select private.can_view_network(auth.uid()))
    and private.in_viewer_partition(author_profile_id)
    and (not is_blocked_between((select auth.uid()), author_profile_id))
    and (sandbox_owner is null or sandbox_owner = (select auth.uid()) or not private.is_sandbox_guest((select auth.uid())))
    and (
      (audience_type = 'wider_network'::text)
      or ((audience_type = 'selected'::text) and ((select auth.uid()) = any (audience_profile_ids)))
      or ((audience_type = 'trusted'::text)
        and exists (select 1 from trusted_colleagues t where t.profile_id = consultations.author_profile_id and t.colleague_id = (select auth.uid())))
      or ((group_id is not null) and private.is_consultation_group_member(group_id, (select auth.uid())))
    )
  );

-- The fictional colleagues never sign in, so nothing is sent to them and nothing
-- is recorded between two of them: it would only pile up, sandbox after sandbox.
-- (Only on the demo site; a guest's own account is not a colleague.)
create or replace function private.is_sandbox_colleague(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(private.cfg('app_env'), '') = 'demo'
     and exists (select 1 from profiles p where p.id = p_id and p.is_demo)
     and not exists (select 1 from auth.users u where u.id = p_id and u.email like '%@sandbox.psyalliance.test');
$function$;
revoke all on function private.is_sandbox_colleague(uuid) from public, anon, authenticated;

create or replace function private.notify_member(p_type text, p_recipient uuid, p_actor uuid, p_summary text, p_link text, p_dedup text, p_meta jsonb, p_email boolean default true, p_email_after interval default '0 seconds')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare ev bigint;
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then
    return;
  end if;
  if private.is_sandbox_colleague(p_recipient) then
    return;
  end if;
  if p_dedup is not null and exists (
    select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id
     where e.dedup_key = p_dedup and d.recipient_profile_id = p_recipient and d.status in ('pending', 'sent')
       and d.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;
  insert into notification_events (event_type, actor_profile_id, actor_type, dedup_key, deep_link, summary, metadata)
  values (p_type, p_actor, case when p_actor is null then 'system' else 'member_web' end::public.actor_type, p_dedup, p_link, p_summary, coalesce(p_meta, '{}'::jsonb))
  returning id into ev;
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at, send_after)
  values (ev, p_recipient, 'in_app', 'sent', now(), now());
  if p_email then
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, send_after)
    values (ev, p_recipient, 'email', 'pending', now() + p_email_after);
  end if;
end;
$function$;
revoke all on function private.notify_member(text, uuid, uuid, text, text, text, jsonb, boolean, interval) from public, anon, authenticated;

create or replace function private.professional_event(p_type text, p_actor uuid, p_related uuid, p_summary text, p_meta jsonb, p_seconds integer default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if private.is_sandbox_colleague(p_actor) and (p_related is null or private.is_sandbox_colleague(p_related)) then
    return;
  end if;
  insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, metadata, response_time_seconds)
  values (p_type, p_actor, 'member_web', p_related, p_summary, coalesce(p_meta, '{}'::jsonb), p_seconds);
end;
$function$;
revoke all on function private.professional_event(text, uuid, uuid, text, jsonb, integer) from public, anon, authenticated;

-- 5. Starting over / leaving ---------------------------------------------------------------
-- Removes everything a guest's sandbox made: the story that was seeded, the
-- arrivals, and anything the guest made themselves.
create or replace function private.clear_demo_viewer(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Cast-made rows are tracked per guest.
  delete from consultations where group_id in (select id from private.demo_rows where tbl = 'consultation_groups' and owner = p_viewer);
  delete from consultation_groups where id in (select id from private.demo_rows where tbl = 'consultation_groups' and owner = p_viewer);
  delete from conversations where id in (select id from private.demo_rows where tbl = 'conversations' and owner = p_viewer);
  delete from referral_requests where id in (select id from private.demo_rows where tbl = 'referral_requests' and owner = p_viewer);
  delete from coverage_plans where id in (select id from private.demo_rows where tbl = 'coverage_plans' and owner = p_viewer);
  delete from consultations where id in (select id from private.demo_rows where tbl = 'consultations' and owner = p_viewer);
  delete from private.demo_rows where owner = p_viewer;
  -- Anything made for or by the guest.
  delete from consultations where sandbox_owner = p_viewer or author_profile_id = p_viewer;
  delete from consultation_groups where created_by = p_viewer;
  delete from consultation_group_members where profile_id = p_viewer;
  delete from referral_requests where requesting_profile_id = p_viewer;
  delete from referral_recipients where profile_id = p_viewer;
  delete from referral_responses where responding_profile_id = p_viewer;
  delete from coverage_plans where profile_id = p_viewer;
  delete from coverage_requests where requested_profile_id = p_viewer;
  delete from conversations where id in (select conversation_id from conversation_participants where profile_id = p_viewer);
  delete from notification_events e where e.actor_profile_id = p_viewer
     or exists (select 1 from notification_deliveries d where d.notification_event_id = e.id and d.recipient_profile_id = p_viewer);
  delete from notification_deliveries where recipient_profile_id = p_viewer;
  delete from workspace_drafts where profile_id = p_viewer;
  delete from saved_resources where profile_id = p_viewer;
  delete from consultation_follows where profile_id = p_viewer;
  delete from consultation_response_useful where profile_id = p_viewer;
  delete from consult_tag_follows where profile_id = p_viewer;
  delete from trusted_colleagues where p_viewer in (profile_id, colleague_id);
  delete from suggested_colleagues where profile_id = p_viewer;
  delete from suggestion_runs where profile_id = p_viewer;
  delete from connections where p_viewer in (requester_id, addressee_id);
  delete from saved_clinicians where profile_id = p_viewer;
  delete from blocked_members where p_viewer in (profile_id, blocked_profile_id);
  delete from professional_events where p_viewer in (actor_profile_id, related_profile_id, subject_profile_id);
  delete from private.sandbox_story where profile_id = p_viewer;
end;
$function$;
revoke all on function private.clear_demo_viewer(uuid) from public, anon, authenticated;

-- 6. Colleagues get in touch, one at a time ---------------------------------------------------
-- A guest starts with a full practice and nothing new arriving. Then, while
-- they look around, five things arrive a few minutes apart (public.sandbox_tick,
-- called by the workspace): a message, a colleague's interest in a referral, a
-- Cover request, a referral, and a question to the network. Each one is made
-- by the colleague through the real function, so it can be answered the way
-- a real one is.
create or replace function private.demo_cast_ids()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(c ->> 'key', p.id), '{}'::jsonb)
    from jsonb_array_elements(private.demo_cast()) c
    join lateral (select pr.id from profiles pr where pr.is_demo and pr.full_name = c ->> 'name' order by pr.created_at limit 1) p on true;
$function$;
revoke all on function private.demo_cast_ids() from public, anon, authenticated;

create or replace function private.seed_demo_viewer_story(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  insert into private.sandbox_story (profile_id, step, next_at) values (p_viewer, 0, now() + interval '240 seconds')
  on conflict (profile_id) do update set step = 0, next_at = now() + interval '240 seconds';
end;
$function$;
revoke all on function private.seed_demo_viewer_story(uuid) from public, anon, authenticated;

create or replace function private.sandbox_story_event(p_viewer uuid, p_step integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint;
  m jsonb; r jsonb; out jsonb := null;
  imani uuid; eli uuid; lena uuid; marcus uuid;
  key text; ref bigint; plan bigint; cid bigint; conv bigint;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return null;
  end if;
  select s.id into pass_id from sandbox_passes s where s.guest_id = p_viewer;
  if pass_id is not null then
    update sandbox_passes set guest_id = null where id = pass_id;
  end if;
  perform set_config('pa.sandbox_owner', p_viewer::text, true);
  m := private.demo_cast_ids();
  imani := (m ->> 'imani')::uuid; eli := (m ->> 'eli')::uuid; lena := (m ->> 'lena')::uuid; marcus := (m ->> 'marcus')::uuid;

  begin
    if p_step = 1 then
      perform private.demo_as(imani);
      key := public.conversation_open('direct', null, null, p_viewer) ->> 'key';
      perform public.message_send(key, 'Hi Rachel, I hope the week is treating you well. Sophie mentioned the Thursday Circle: do you think there might be room for one more voice in the group?', md5('story-1-' || p_viewer)::uuid);
      conv := private.demo_conv(key);
      insert into private.demo_rows (tbl, id, owner) values ('conversations', conv, p_viewer);
      out := jsonb_build_object('step', 1, 'kind', 'message', 'title', 'Imani Ambershaw sent you a message',
        'body', 'Do you think there might be room for one more voice in the Thursday Circle?', 'view', 'messages', 'key', key);
    elsif p_step = 2 then
      select rr.id into ref from referral_requests rr
       where rr.requesting_profile_id = p_viewer and rr.state = 'NY' and rr.status in ('open', 'sent', 'matched')
         and exists (select 1 from referral_recipients x where x.referral_request_id = rr.id and x.profile_id = imani)
       order by rr.id limit 1;
      if ref is not null then
        perform private.demo_as(imani);
        perform public.referral_answer(ref, 'interested', true);
        out := jsonb_build_object('step', 2, 'kind', 'referral', 'title', 'Imani Ambershaw is interested in your New York referral',
          'body', 'Interested is not placed. Review the replies, then choose who to place the referral with.', 'view', 'referrals', 'id', ref);
      end if;
    elsif p_step = 3 then
      perform private.demo_as(eli);
      r := public.cover_create_plan(jsonb_build_object(
        'requestId', md5('story-3-' || p_viewer)::uuid, 'name', 'Winter holiday cover', 'reason', 'short', 'other', '',
        'start', to_char(current_date + 60, 'YYYY-MM-DD'), 'end', to_char(current_date + 70, 'YYYY-MM-DD'),
        'mode', 'sequential', 'deadline', 48, 'message', 'Would you be able to help with temporary cover over the holidays? A brief conversation would be useful.',
        'clients', jsonb_build_array(private.demo_client('Client 1', 'Anxiety/Panic Disorders', 'MA', '', 'virtual', 'Adults', 'Weekly', jsonb_build_array(p_viewer)))));
      if jsonb_array_length(r -> 'dropped') = 0 then
        plan := (r ->> 'planId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan, p_viewer);
        out := jsonb_build_object('step', 3, 'kind', 'cover', 'title', 'Eli Kestrelby asked you about temporary cover',
          'body', 'Winter holiday cover, one client. Answer, or ask a question first.', 'view', 'cover', 'id', plan);
      end if;
    elsif p_step = 4 then
      perform private.demo_as(lena);
      r := public.referral_create(jsonb_build_object(
        'requestId', md5('story-4-' || p_viewer)::uuid, 'state', 'VT', 'setting', 'virtual', 'focus', 'Depression', 'secondary', '', 'age', 'Adults',
        'insurance', '', 'language', '', 'city', '', 'audience', 'selected', 'selected', jsonb_build_array(p_viewer),
        'timeframe', 'Within a month', 'message', 'Weekly virtual sessions, mornings if possible.', 'prescribing', false));
      if jsonb_array_length(r -> 'dropped') = 0 then
        ref := (r ->> 'referralId')::bigint;
        insert into private.demo_rows (tbl, id, owner) values ('referral_requests', ref, p_viewer);
        out := jsonb_build_object('step', 4, 'kind', 'referral', 'title', 'Lena Larkhollow sent you a referral request',
          'body', 'An adult with depression in Vermont, by video. Say whether you are interested.', 'view', 'referrals', 'id', ref);
      end if;
    elsif p_step = 5 then
      perform private.demo_as(marcus);
      r := public.consult_post(jsonb_build_object(
        'clientRequestId', md5('story-5-' || p_viewer)::uuid, 'title', 'Missed sessions with clients who travel for work',
        'body', 'How do you handle repeated missed or rescheduled sessions with clients whose work takes them away? I am weighing a flexible policy against a firmer one.',
        'topic', 'Professional life', 'tags', '[]'::jsonb, 'confirmed', 'true', 'audience', 'network'));
      cid := (r ->> 'id')::bigint;
      insert into private.demo_rows (tbl, id, owner) values ('consultations', cid, p_viewer);
      out := jsonb_build_object('step', 5, 'kind', 'consult', 'title', 'Marcus Reed asked the network a question',
        'body', 'Missed sessions with clients who travel for work.', 'view', 'consult', 'id', cid);
    end if;
  exception when others then
    raise warning 'sandbox_story_event(%, %): %', p_viewer, p_step, sqlerrm;
    out := null;
  end;

  perform set_config('pa.sandbox_owner', '', true);
  perform private.demo_restore(saved_claims, saved_sub);
  if pass_id is not null then
    update sandbox_passes set guest_id = p_viewer where id = pass_id;
  end if;
  return out;
end;
$function$;
revoke all on function private.sandbox_story_event(uuid, integer) from public, anon, authenticated;

drop function if exists public.sandbox_tick();
create or replace function public.sandbox_tick(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  st record;
  result jsonb;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    return null;
  end if;
  select * into st from private.sandbox_story where profile_id = me for update skip locked;
  if st.profile_id is null or st.step >= 5 then
    return null;
  end if;
  if not coalesce(p_force, false) and now() < st.next_at then
    return null;
  end if;
  result := private.sandbox_story_event(me, st.step + 1);
  update private.sandbox_story
     set step = st.step + 1,
         next_at = now() + (array[interval '6 minutes', interval '7 minutes', interval '8 minutes', interval '10 minutes', interval '0 seconds'])[st.step + 1]
   where profile_id = me;
  return result;
end;
$function$;
revoke execute on function public.sandbox_tick(boolean) from public, anon;
grant execute on function public.sandbox_tick(boolean) to authenticated;

-- 7. Colleagues answer what a guest asks ------------------------------------------------------
-- Things the guest makes themselves (not the seeded story, which stays exactly
-- as designed until the guest changes it) get an answer from the fictional
-- colleagues after a short wait, through the same functions a real answer
-- uses. Different colleagues answer differently, the same way every time.
create or replace function private.demo_autorespond()
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  r record;
  acted integer := 0;
  pass_ids bigint[]; guests uuid[];
  h integer; resp text; conv_key text; body text;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    return 0;
  end if;
  select coalesce(array_agg(s.id), '{}'), coalesce(array_agg(s.guest_id), '{}') into pass_ids, guests
    from sandbox_passes s where s.guest_id is not null and s.revoked_at is null and s.expires_at > now();
  if coalesce(array_length(guests, 1), 0) = 0 then
    return 0;
  end if;
  -- Guests are hidden from the colleagues in the product; answering needs them seen.
  update sandbox_passes set guest_id = null where id = any(pass_ids);

  -- Cover: the guest's own plans (not the seeded ones), asked more than 90 seconds ago.
  for r in
    select cr.id, cr.requested_profile_id as person, pl.profile_id as owner, pl.id as plan_id
      from coverage_requests cr
      join coverage_plan_cases c on c.id = cr.coverage_plan_case_id
      join coverage_plans pl on pl.id = c.coverage_plan_id
     where cr.status = 'sent' and cr.sent_at < now() - interval '90 seconds'
       and pl.profile_id = any(guests) and not (cr.requested_profile_id = any(guests))
       and not exists (select 1 from private.demo_rows d where d.tbl = 'coverage_plans' and d.id = pl.id and d.owner = pl.profile_id)
     order by cr.id
  loop
    -- An earlier answer in this run may have settled it (parallel asks: one winner per client).
    perform 1 from coverage_requests q where q.id = r.id and q.status = 'sent';
    continue when not found;
    h := abs(hashtext('cover:' || r.id)) % 100;
    resp := case when h < 60 then 'accepted' when h < 80 then 'declined' else 'discussing' end;
    begin
      perform private.demo_as(r.person);
      perform public.cover_answer(r.id, resp,
        case when resp = 'discussing' then 'Could we talk this through briefly before I decide? I want to be sure I can give your client the time.' end,
        md5('auto-cover-' || r.id)::uuid);
      acted := acted + 1;
    exception when others then
      begin
        perform private.demo_as(r.person);
        perform public.cover_answer(r.id, 'declined', null, md5('auto-cover-decline-' || r.id)::uuid);
        acted := acted + 1;
      exception when others then
        raise warning 'demo_autorespond cover %: %', r.id, sqlerrm;
      end;
    end;
  end loop;

  -- Referrals: the guest's own referrals, each colleague asked more than 90 seconds ago.
  for r in
    select rc.referral_request_id as ref, rc.profile_id as person, rr.requesting_profile_id as owner
      from referral_recipients rc
      join referral_requests rr on rr.id = rc.referral_request_id
     where rr.requesting_profile_id = any(guests) and rr.status in ('open', 'sent', 'matched')
       and rc.sent_at < now() - interval '90 seconds' and not (rc.profile_id = any(guests))
       and not exists (select 1 from referral_responses x where x.referral_request_id = rc.referral_request_id and x.responding_profile_id = rc.profile_id)
       and not exists (select 1 from private.demo_rows d where d.tbl = 'referral_requests' and d.id = rr.id and d.owner = rr.requesting_profile_id)
     order by rc.referral_request_id, rc.profile_id
  loop
    h := abs(hashtext('ref:' || r.ref || ':' || r.person)) % 100;
    continue when h >= 80; -- some colleagues simply have not answered yet
    resp := case when h < 55 then 'interested' else 'declined' end;
    begin
      perform private.demo_as(r.person);
      perform public.referral_answer(r.ref, resp, resp = 'interested');
      acted := acted + 1;
    exception when others then
      begin
        perform private.demo_as(r.person);
        perform public.referral_answer(r.ref, 'declined', false);
        acted := acted + 1;
      exception when others then
        raise warning 'demo_autorespond referral %/%: %', r.ref, r.person, sqlerrm;
      end;
    end;
  end loop;

  -- Consult: the guest's own questions with no reply yet, asked more than 90 seconds ago.
  for r in
    select c.id, c.author_profile_id as owner, c.question from consultations c
     where c.author_profile_id = any(guests) and c.status = 'open' and c.created_at < now() - interval '90 seconds'
       and not exists (select 1 from consultation_responses x where x.consultation_id = c.id)
     order by c.id
  loop
    declare responder uuid; begin
      select p.id into responder from profiles p
       where p.is_demo and not (p.id = any(guests)) and p.id <> r.owner and p.consultation_availability <> 'no'
         and p.verification_status = 'verified' and p.account_status = 'active'
         and private.consult_can_see(r.id, p.id)
       order by (p.consultation_availability = 'yes') desc, md5(r.id::text || p.id::text) limit 1;
      continue when responder is null;
      body := case
        when r.question ~* '(leave|cover|hand-?off|away|vacation|sabbatical|parental)' then 'For leave, I would agree the handover in writing first: who covers which clients, how urgent contacts reach them, and when the summary goes over. A short call before you go makes the transfer feel like continuity.'
        when r.question ~* '(refer|wait ?list)' then 'I would send two or three names that fit the client''s needs, insurance and location, and offer a short call with the colleague first. It makes the transfer feel like continuity rather than a goodbye.'
        when r.question ~* '(supervis|licensure|trainee)' then 'Happy to talk it through. I would agree the frequency, how cases are presented and how notes are kept before the first session.'
        when r.question ~* '(consent|telehealth|state|license|board)' then 'Check your state board''s current guidance first, then put it in your consent form in plain language. That covers most of the risk.'
        when r.question ~* '(record|subpoena|documentation|notes)' then 'Document the reasoning, not just the decision, and keep a copy of anything you release. For a subpoena, call your liability carrier before you respond.'
        when r.question ~* '(fee|billing|insurance|superbill|payment)' then 'Put it in your financial policy and go over it at intake. Clients rarely object to a rule they heard about up front.'
        else 'I would start by naming what has not worked and agreeing one small, concrete goal for the next three sessions. It keeps the conversation practical.'
      end;
      perform private.demo_as(responder);
      perform public.consult_reply(r.id, body, md5('auto-reply-' || r.id)::uuid);
      acted := acted + 1;
    exception when others then
      raise warning 'demo_autorespond consult %: %', r.id, sqlerrm;
    end;
  end loop;

  -- Messages: the guest's last message in a conversation, unanswered for 90 seconds.
  for r in
    select distinct on (m.conversation_id) m.conversation_id as conv, m.author_id as owner, m.id as msg
      from conversation_messages m
     where m.author_id = any(guests) and m.created_at < now() - interval '90 seconds' and m.created_at > now() - interval '1 day'
       and not exists (select 1 from conversation_messages y where y.conversation_id = m.conversation_id and y.created_at > m.created_at)
     order by m.conversation_id, m.created_at desc
  loop
    declare other uuid; begin
      select cp.profile_id into other from conversation_participants cp
       where cp.conversation_id = r.conv and cp.profile_id <> r.owner and not (cp.profile_id = any(guests)) limit 1;
      continue when other is null;
      perform private.demo_as(other);
      perform public.message_send('c-' || r.conv,
        (array['Thanks, that works for me. I will send a couple of times for a quick call.',
               'Thank you, Rachel. That is helpful, and I am glad to talk it through whenever suits you.',
               'Understood. Let me check my diary and come back to you shortly.'])[1 + abs(hashtext('msg:' || r.msg)) % 3],
        md5('auto-msg-' || r.msg)::uuid);
      acted := acted + 1;
    exception when others then
      raise warning 'demo_autorespond message %: %', r.msg, sqlerrm;
    end;
  end loop;

  perform private.demo_restore(null, null);
  update sandbox_passes s set guest_id = x.g from unnest(pass_ids, guests) as x(i, g) where s.id = x.i;

  -- Continuity: a backup or alternate the guest invites agrees after a minute.
  for r in
    select c.profile_id as owner, c.backup_profile_id as backup, c.alternate_profile_id as alternate, c.backup_status, c.alternate_status
    from continuity_plans c
    where private.is_sandbox_guest(c.profile_id) and c.updated_at < now() - interval '1 minute'
      and (c.backup_status = 'invited' or c.alternate_status = 'invited')
  loop
    perform set_config('pa.continuity_response', 'on', true);
    update continuity_plans set
      backup_status = case when backup_status = 'invited' then 'accepted' else backup_status end,
      backup_responded_at = case when backup_status = 'invited' then now() else backup_responded_at end,
      alternate_status = case when alternate_status = 'invited' then 'accepted' else alternate_status end,
      alternate_responded_at = case when alternate_status = 'invited' then now() else alternate_responded_at end
    where profile_id = r.owner;
    perform set_config('pa.continuity_response', '', true);
    if r.backup_status = 'invited' then
      perform private.notify_member(r.owner, r.backup, 'agreed to be the backup in your continuity plan', '/dashboard/continuity');
    end if;
    if r.alternate_status = 'invited' then
      perform private.notify_member(r.owner, r.alternate, 'agreed to be the alternate backup in your continuity plan', '/dashboard/continuity');
    end if;
    acted := acted + 1;
  end loop;

  return acted;
end;
$function$;
revoke all on function private.demo_autorespond() from public, anon, authenticated;

-- 8. "Try the whole journey": the guest's own controls ----------------------------------------
-- Pick an open request and have the colleague answer it now (or let its
-- deadline pass). The colleague answers through the same function a real
-- answer uses, so deadlines, pauses, the next colleague in a sequence and
-- notifications all behave as they do for real. Guests only; demo site only.
create or replace function public.sandbox_respond(p_kind text, p_ref bigint, p_case bigint, p_person uuid, p_response text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  me uuid := auth.uid();
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint;
  rid bigint; st text; resp text;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    raise exception 'These controls are only in the sandbox.' using errcode = 'P0001';
  end if;
  if p_person is null or not private.profile_is_demo(p_person) or private.is_sandbox_guest(p_person) then
    raise exception 'Choose a colleague.' using errcode = 'P0001';
  end if;
  if p_response not in ('accepted', 'declined', 'discussing', 'expired') then
    raise exception 'Choose a response.' using errcode = 'P0001';
  end if;
  select s.id into pass_id from sandbox_passes s where s.guest_id = me;

  if p_kind = 'cover' then
    select r.id, r.status::text into rid, st
      from coverage_requests r
      join coverage_plan_cases c on c.id = r.coverage_plan_case_id
      join coverage_plans pl on pl.id = c.coverage_plan_id
     where pl.id = p_ref and c.id = p_case and pl.profile_id = me and r.requested_profile_id = p_person and r.status in ('sent', 'discussing')
     order by r.id desc limit 1;
    if rid is null then
      raise exception 'That request is not open.' using errcode = 'P0001';
    end if;
    if p_response = 'expired' then
      if st = 'discussing' then
        raise exception 'A discussion pauses the response deadline.' using errcode = 'P0001';
      end if;
      update coverage_requests set expires_at = now() - interval '1 minute' where id = rid;
      perform private.cover_process_deadlines();
    else
      update sandbox_passes set guest_id = null where id = pass_id;
      perform private.demo_as(p_person);
      perform public.cover_answer(rid, p_response,
        case when p_response = 'discussing' then 'Could we talk this through briefly before I decide? I want to be sure I can give your client the time.' end,
        gen_random_uuid());
      perform private.demo_restore(saved_claims, saved_sub);
      update sandbox_passes set guest_id = me where id = pass_id;
    end if;
  elsif p_kind = 'referral' then
    if not exists (select 1 from referral_requests rr where rr.id = p_ref and rr.requesting_profile_id = me) then
      raise exception 'That referral is not yours.' using errcode = 'P0001';
    end if;
    resp := case p_response when 'accepted' then 'interested' when 'expired' then 'declined' else p_response end;
    update sandbox_passes set guest_id = null where id = pass_id;
    perform private.demo_as(p_person);
    perform public.referral_answer(p_ref, resp, resp = 'interested',
      case when resp = 'discussing' then 'Could I ask a couple of questions before I say yes? I want to be sure this is the right fit.' end,
      gen_random_uuid());
    perform private.demo_restore(saved_claims, saved_sub);
    update sandbox_passes set guest_id = me where id = pass_id;
  else
    raise exception 'Choose cover or a referral.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true);
exception when others then
  -- Put the guest back out of sight even when the answer was refused.
  perform private.demo_restore(saved_claims, saved_sub);
  update sandbox_passes set guest_id = me where id = pass_id and guest_id is null;
  raise;
end;
$function$;
revoke execute on function public.sandbox_respond(text, bigint, bigint, uuid, text) from public, anon;
grant execute on function public.sandbox_respond(text, bigint, bigint, uuid, text) to authenticated;

-- The other colleague confirms the handover on a plan that asked the guest:
-- the guest's "agreed" becomes "Handover ready".
create or replace function public.sandbox_confirmation(p_plan bigint, p_case bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  me uuid := auth.uid();
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint; owner uuid;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    raise exception 'These controls are only in the sandbox.' using errcode = 'P0001';
  end if;
  select pl.profile_id into owner
    from coverage_plans pl join coverage_plan_cases c on c.coverage_plan_id = pl.id
   where pl.id = p_plan and c.id = p_case and pl.profile_id <> me
     and exists (select 1 from coverage_requests r where r.coverage_plan_case_id = c.id and r.requested_profile_id = me and r.status = 'accepted');
  if owner is null then
    raise exception 'There is no agreed client to confirm here.' using errcode = 'P0001';
  end if;
  select s.id into pass_id from sandbox_passes s where s.guest_id = me;
  update sandbox_passes set guest_id = null where id = pass_id;
  perform private.demo_as(owner);
  perform public.cover_confirm_handover(p_plan, p_case, true, true, true);
  perform private.demo_restore(saved_claims, saved_sub);
  update sandbox_passes set guest_id = me where id = pass_id;
  return jsonb_build_object('ok', true);
exception when others then
  perform private.demo_restore(saved_claims, saved_sub);
  update sandbox_passes set guest_id = me where id = pass_id and guest_id is null;
  raise;
end;
$function$;
revoke execute on function public.sandbox_confirmation(bigint, bigint) from public, anon;
grant execute on function public.sandbox_confirmation(bigint, bigint) to authenticated;

-- Two worked examples: the guest's availability confirmed N days ago (the 90-day
-- rule), and a reply from Maya in the Cover conversation about Client 2.
create or replace function public.sandbox_example(p_name text, p_days integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  me uuid := auth.uid();
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
  pass_id bigint; maya uuid; plan bigint; cs bigint; key text;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    raise exception 'These controls are only in the sandbox.' using errcode = 'P0001';
  end if;
  if p_name = 'availability' then
    if p_days is null or p_days < 0 or p_days > 400 then
      raise exception 'Choose a number of days.' using errcode = 'P0001';
    end if;
    update profiles set availability_confirmed_at = now() - make_interval(days => p_days) where id = me;
    return jsonb_build_object('ok', true, 'days', p_days, 'included', public.availability_is_fresh(now() - make_interval(days => p_days)));
  elsif p_name = 'cover_reply' then
    maya := (private.demo_cast_ids() ->> 'maya')::uuid;
    select pl.id, c.id into plan, cs from coverage_plans pl join coverage_plan_cases c on c.coverage_plan_id = pl.id
     where pl.profile_id = me and pl.title = 'Fall leave cover' and c.case_reference = 'Client 2' limit 1;
    if plan is null then
      raise exception 'Fall leave cover is not in this sandbox any more. Use "Start the story again" to bring it back.' using errcode = 'P0001';
    end if;
    key := public.conversation_open('cover', plan, cs, maya) ->> 'key';
    select s.id into pass_id from sandbox_passes s where s.guest_id = me;
    update sandbox_passes set guest_id = null where id = pass_id;
    perform private.demo_as(maya);
    perform public.message_send(key, 'Example reply about Client 2 only. Ready to discuss the handover.', gen_random_uuid());
    perform private.demo_restore(saved_claims, saved_sub);
    update sandbox_passes set guest_id = me where id = pass_id;
    return jsonb_build_object('ok', true, 'key', key);
  end if;
  raise exception 'Choose an example.' using errcode = 'P0001';
exception when others then
  perform private.demo_restore(saved_claims, saved_sub);
  update sandbox_passes set guest_id = me where id = pass_id and guest_id is null;
  raise;
end;
$function$;
revoke execute on function public.sandbox_example(text, integer) from public, anon;
grant execute on function public.sandbox_example(text, integer) to authenticated;

-- What the workspace shows about the sandbox it is in.
create or replace function public.sandbox_info()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('label', s.label, 'expiresAt', s.expires_at,
                            'arrivals', jsonb_build_object('done', coalesce(st.step, 0), 'total', 5))
    from sandbox_passes s left join private.sandbox_story st on st.profile_id = s.guest_id
   where s.guest_id = auth.uid() and coalesce(private.cfg('app_env'), '') = 'demo';
$function$;
revoke execute on function public.sandbox_info() from public, anon;
grant execute on function public.sandbox_info() to authenticated;

-- 9. A new guest ---------------------------------------------------------------------------------
-- The guest is Rachel Davis, the psychologist of the guided demos. Re-opening
-- the same link carries on with the same sandbox.
create or replace function public.claim_sandbox(p_token text)
returns table(email text, password text, expires_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  pass record;
  gid uuid := gen_random_uuid();
  gmail text;
  pw text := encode(gen_random_bytes(24), 'hex');
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' then
    raise exception 'Sandboxes exist only on the demo site.' using errcode = 'P0001';
  end if;
  select * into pass from sandbox_passes s
  where s.token = p_token and s.revoked_at is null and s.expires_at > now()
  for update;
  if pass.id is null then
    raise exception 'This sandbox link has expired. Ask for a new one.' using errcode = 'P0001';
  end if;

  if pass.guest_id is not null then
    select u.email into gmail from auth.users u where u.id = pass.guest_id;
    if gmail is not null then
      update auth.users set encrypted_password = crypt(pw, gen_salt('bf')), updated_at = now() where id = pass.guest_id;
      update sandbox_passes set claimed_at = now(), claims = claims + 1 where id = pass.id;
      return query select gmail, pw, pass.expires_at;
      return;
    end if;
  end if;

  gmail := 'guest-' || substr(replace(gid::text, '-', ''), 1, 12) || '@sandbox.psyalliance.test';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gid, 'authenticated', 'authenticated', gmail,
    crypt(pw, gen_salt('bf')), now(), '', '', '', '',
    '{"provider":"email","providers":["email"],"created_by_system":"true"}'::jsonb,
    jsonb_build_object('full_name', 'Rachel Davis'), false, false, now(), now());
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), gid, gid::text, 'email', jsonb_build_object('sub', gid::text, 'email', gmail, 'email_verified', true), now(), now(), now());

  insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified,
    verification_status, verified_at, is_demo, account_status, account_kind, directory_visible)
  values (gid, 'Rachel Davis', 'Dr.', 'PhD', 'MA', 'Boston', array['MA', 'NY', 'VT'], 'verified', now(), true, 'active', 'clinician', true)
  on conflict (id) do nothing;

  perform private.seed_demo_viewer(gid);
  update sandbox_passes set guest_id = gid, claimed_at = now(), claims = claims + 1 where id = pass.id;
  return query select gmail, pw, pass.expires_at;
end;
$function$;
revoke execute on function public.claim_sandbox(text) from public;
grant execute on function public.claim_sandbox(text) to anon, authenticated;

-- 10. Checks (every column should be true) ------------------------------------------------------
select
  to_regprocedure('public.sandbox_tick(boolean)') is not null as tick_ready,
  to_regprocedure('public.sandbox_respond(text,bigint,bigint,uuid,text)') is not null as controls_ready,
  to_regprocedure('private.seed_demo_viewer(uuid)') is not null as story_ready,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'consultations' and column_name = 'sandbox_owner') as discussions_isolated,
  position('Rachel Davis' in pg_get_functiondef('public.claim_sandbox(text)'::regprocedure)) > 0 as guest_is_rachel;
