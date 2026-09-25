-- Demo network v2 (25 Sept 2026) and server-side search.
--
-- 1. private.seed_demo_network: 200 fictional clinicians in each of NY, NJ,
--    MA, CT, RI and VT (1,200). Every specialty is someone's first or
--    second focus at least six times in every state, so a demo search never
--    comes back empty. Insurance plans are regional. A fixed cast (Maya
--    Chen, Eli Ramirez, Imani Brooks, Samuel Okafor, Lena Park, Noah Patel)
--    matches the guided tour.
-- 2. private.seed_demo_viewer: the sandbox story for Dr. Alex Rivers, PsyD,
--    Brooklyn, NY (licensed NY and NJ), with a complete profile and a six-
--    week leave that always starts five to six weeks after the pass opens.
-- 3. public.claim_sandbox: creates Alex, then seeds the story.
-- 4. public.network_directory / public.match_pool: one row per person,
--    filtered and paged in the database (the API returns at most 1,000 rows).
-- 5. public.network_coverage: which states and specialties have enough
--    available members; the demo only offers those in its dropdowns.
-- Applied to both projects so their functions stay identical.

create or replace function private.seed_demo_network(p_nick uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  f_names text[] := array['Sarah','Emily','Jessica','Rachel','Laura','Megan','Priya','Aisha','Mei','Sofia','Elena','Grace','Hannah','Olivia','Maya','Leah','Nadia','Claire','Anna','Rebecca',
    'Julia','Naomi','Amara','Yasmin','Keiko','Lucia','Isabel','Tamara','Monica','Diana','Fatima','Ines','Zara','Helen','Ruth','Alicia','Joanna','Esther','Victoria','Chloe',
    'Beatriz','Simone','Imani','Farah','Linh','Rosa','Nora','Gabriela','Kavya','Lena','Miriam','Adriana','Talia','Noor','Camille','Renee','Sabrina','Ingrid','Paula','Carmen'];
  m_names text[] := array['Michael','David','James','Daniel','Andrew','Ryan','Carlos','Omar','Wei','Diego','Marcus','Samuel','Jonathan','Benjamin','Ethan','Aaron','Hiroshi','Rafael','Kwame','Tomas',
    'Nathan','Adrian','Victor','Julian','Elias','Arjun','Mateo','Felix','Hassan','Luis','Owen','Simon','Theo','Isaac','Gabriel','Ravi','Andre','Peter','Joel','Martin',
    'Colin','Dmitri','Kenji','Emeka','Sanjay','Pablo','Graham','Leon','Jamal','Stefan','Ivan','Moses','Reuben','Declan','Hugo','Anton','Idris','Marco','Paolo','Tobias'];
  l_names text[] := array['Chen','Patel','Garcia','Nguyen','Kim','Rodriguez','Okafor','Rossi','Singh','Haddad','Levy','Cohen','Murphy','Sullivan','Brennan','Walsh','Novak','Silva','Reyes','Castillo',
    'Ramirez','Morales','Ortiz','Bianchi','Moreau','Schmidt','Larsson','Kowalski','Petrov','Osei','Mensah','Abara','Khan','Ali','Rahman','Tanaka','Ito','Park','Lee','Choi',
    'Hughes','Bennett','Carter','Foster','Hayes','Howard','Harper','Jordan','Keller','Lawson','Mitchell','Nelson','Porter','Reed','Russell','Shaw','Stone','Turner','Warren','Wells',
    'Adler','Baxter','Coleman','Dalton','Ellis','Fischer','Gordon','Hart','Irwin','Jensen','Klein','Lowe','Marsh','Nolan','Owens','Pierce','Quinn','Ross','Stein','Thorne'];
  states text[] := array['NY','NJ','MA','CT','RI','VT'];
  state_names text[] := array['New York','New Jersey','Massachusetts','Connecticut','Rhode Island','Vermont'];
  neighbours text[] := array['NJ','NY','RI','NY','MA','NY'];
  cities text[] := array[
    ['Manhattan','Brooklyn','Queens','White Plains','Albany','Buffalo','Rochester','Brooklyn'],
    ['Jersey City','Newark','Hoboken','Princeton','Montclair','Morristown','Red Bank','Cherry Hill'],
    ['Boston','Cambridge','Somerville','Brookline','Newton','Worcester','Springfield','Northampton'],
    ['Hartford','New Haven','Stamford','Greenwich','West Hartford','Norwalk','Fairfield','Middletown'],
    ['Providence','Newport','Warwick','Cranston','East Greenwich','Pawtucket','Westerly','Barrington'],
    ['Burlington','Montpelier','Brattleboro','Rutland','Middlebury','Stowe','St. Johnsbury','Manchester']];
  national_plans text[] := array['Aetna','Cigna','UnitedHealthcare / Optum','Blue Cross Blue Shield','Medicare','Medicaid','Magellan Behavioral Health','Carelon Behavioral Health','Humana','Tricare'];
  regional_plans text[] := array[
    'EmblemHealth|Fidelis Care|MVP Health Care|Oxford Health Plans|Anthem',
    'Oxford Health Plans|Carelon Behavioral Health',
    'Harvard Pilgrim Health Care|Tufts Health Plan',
    'Anthem|Oxford Health Plans|Harvard Pilgrim Health Care',
    'Tufts Health Plan|Harvard Pilgrim Health Care',
    'MVP Health Care|Blue Cross Blue Shield'];
  common_spec int[] := array[7,16,61,2,24,36,27,41,21,1,10,45,35,57,34,44,58,12];
  common_mod int[] := array[67,71,94,98,82,97,81,96,64,86,279,280,281,282,283];
  other_lang int[] := array[181,181,181,181,171,171,151,179,159,135,192,167,191,176,152,158,174,156];
  ids uuid[] := '{}';
  sts text[] := '{}';
  s int; i int; k int; pos int; g text; fn text; ln text; pid uuid; q text; st text; city text; av text; jf int; jm int;
  r float; ref_av text; cov_av text; con_av text; conf timestamptz; spaces int; spec int[]; mods int[]; ages int[]; plans text[];
  s1 int; s2 int; spec_names text[]; mod_names text[]; age_names text[]; bio text; t int;
  a uuid; b uuid; n int; j int; cons_id bigint;
  by_state uuid[][];
  cast_row record;
begin
  perform setseed(0.4242);
  perform private.purge_demo_network();

  for s in 1..6 loop
    st := states[s];
    for i in 1..200 loop
      k := (s - 1) * 200 + i;
      g := case when k % 2 = 0 then 'f' else 'm' end;
      pos := (k - 1) / 2;
      fn := case when g = 'f' then f_names[1 + pos % 60] else m_names[1 + pos % 60] end;
      ln := l_names[1 + ((pos / 60) * 17 + pos * 3) % 80];
      city := cities[s][1 + (i * 5) % 8];
      -- About 55% have a portrait; within a state no portrait repeats, and
      -- a few are held back for the cast and for Alex.
      jf := i / 2;
      jm := (i + 1) / 2;
      av := case
        when g = 'f' and jf between 1 and 54 then 'demo/f' || lpad((((jf + 7 * s) % 59) + 1)::text, 2, '0') || '.svg'
        when g = 'm' and jm between 1 and 57 then 'demo/m' || lpad((((jm + 11 * s) % 60) + 1)::text, 2, '0') || '.svg'
        else null end;
      if random() < 0.12 then av := null; end if;
      pid := gen_random_uuid();
      r := random();
      q := case when r < 0.42 then 'PhD' when r < 0.72 then 'PsyD' when r < 0.77 then 'EdD' when r < 0.95 then 'MD' else 'DO' end;

      r := random();
      if r < 0.65 then conf := now() - (random() * 27 || ' days')::interval;
      elsif r < 0.85 then conf := now() - ((31 + random() * 55) || ' days')::interval;
      elsif r < 0.95 then conf := now() - ((95 + random() * 60) || ' days')::interval;
      else conf := null; end if;
      r := random();
      ref_av := case when conf is null then null when r < 0.52 then 'yes' when r < 0.8 then 'limited' when r < 0.9 then 'no' else 'yes' end;
      r := random();
      cov_av := case when conf is null then null when r < 0.45 then 'yes' when r < 0.82 then 'ask_me' else 'no' end;
      con_av := case when conf is null then null when random() < 0.8 then 'yes' else 'no' end;
      spaces := case when ref_av in ('yes', 'limited') and random() < 0.7 then floor(random() * 6)::int end;

      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', pid, 'authenticated', 'authenticated',
        'demo-' || lower(fn) || '.' || lower(ln) || '-' || k || '@seed.psyalliance.test',
        crypt(gen_random_uuid()::text, gen_salt('bf', 4)), now(),
        '{"provider":"email","providers":["email"],"created_by_system":"true"}'::jsonb, '{}'::jsonb, false, false,
        now() - ((30 + random() * 360) || ' days')::interval, now());

      -- Two guaranteed focuses cycle through every specialty in every
      -- state; one to three more lean towards the common ones.
      s1 := 1 + ((i * 7 + s * 3) % 62);
      s2 := 1 + ((i * 11 + s * 5 + 17) % 62);
      if s2 = s1 then s2 := 1 + (s2 % 62); end if;
      select array[s1, s2] || coalesce(array_agg(x), '{}') into spec from (
        select x from generate_series(1, 62) x
        where x not in (s1, s2)
        order by random() * case when x = any (common_spec) then 0.25 else 1 end
        limit 1 + floor(random() * 3)::int) z;
      select array_agg(x) into mods from (
        select x from (select generate_series(63, 102) x union all select generate_series(279, 286)) m
        order by random() * case when x = any (common_mod) then 0.2 else 1 end
        limit 2 + floor(random() * 3)::int) z;
      if q in ('MD', 'DO') then mods := mods || 287; end if;
      select array_agg(x) into ages from (
        select x from generate_series(196, 200) x
        order by random() * case when x in (197, 198) then 0.3 else 1 end
        limit 1 + floor(random() * 3)::int) z;
      select array_agg(value order by array_position(spec, id::int)) into spec_names from lookup_values where id = any (spec);
      select array_agg(value order by array_position(mods, id::int)) into mod_names from lookup_values where id = any (mods);
      select array_agg(lower(value) order by id desc) into age_names from lookup_values where id = any (ages);

      t := 1 + floor(random() * 4)::int;
      bio := case t
        when 1 then 'I work with ' || array_to_string(age_names, ' and ') || ' navigating ' || lower(spec_names[1]) || ' and ' || lower(spec_names[2])
          || ', mostly using ' || mod_names[1] || '. I see people in person in ' || city || ' and by telehealth across ' || state_names[s] || '.'
        when 2 then (case when q in ('MD', 'DO') then 'Psychiatrist' else 'Psychologist' end) || ' in ' || city || ' focused on ' || spec_names[1]
          || ', ' || spec_names[2] || ' and ' || spec_names[3] || '. My approach draws on ' || mod_names[1] || ' and ' || mod_names[2] || '.'
        when 3 then 'Most of my practice is ' || lower(spec_names[1]) || ' with ' || array_to_string(age_names, ' and ') || '. I also take referrals for '
          || lower(spec_names[2]) || '. ' || mod_names[1] || '-informed, collaborative and practical.'
        else 'Based in ' || city || ', ' || state_names[s] || '. I see ' || array_to_string(age_names, ' and ') || ' for ' || lower(spec_names[1])
          || ' and ' || lower(spec_names[2]) || ', and I value close working relationships with referring colleagues.' end;

      insert into profiles (id, full_name, credential_prefix, qualification_level, board_certified, primary_practice_city,
        states_qualified, primary_state, accepting_referrals, verification_status, verified_at, last_active_at,
        contact_email, open_to_group_consultation, open_to_give_supervision, open_to_receive_supervision,
        psypact_participating, avatar_path, referral_availability, coverage_availability, consultation_availability,
        availability_confirmed_at, approx_spaces, availability_paused_until, bio, is_demo, account_status, created_at)
      values (pid, fn || ' ' || ln, 'Dr.', q::qualification_level, random() < 0.3, city,
        array[st], st, coalesce(ref_av = 'yes', false), 'verified', now() - ((20 + random() * 300) || ' days')::interval,
        now() - ((random() * 20) || ' days')::interval,
        'demo-' || lower(fn) || '.' || lower(ln) || '@seed.psyalliance.test',
        random() < 0.75, random() < 0.25, random() < 0.08,
        q not in ('MD', 'DO') and random() < 0.4, av,
        coalesce(ref_av, 'yes'), coalesce(cov_av, 'ask_me'), coalesce(con_av, 'yes'), conf, spaces,
        case when i in (9, 47, 88, 113, 161) then current_date + (10 + floor(random() * 30)::int) end,
        bio, true, 'active', now() - ((30 + random() * 360) || ' days')::interval);

      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, o::int from unnest(spec) with ordinality as u(x, o);
      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, null from unnest(mods) x on conflict do nothing;
      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, null from unnest(ages) x;
      plans := national_plans || string_to_array(regional_plans[s], '|') || string_to_array(regional_plans[s], '|');
      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, lv.id, null from lookup_values lv
      where lv.category = 'insurance' and lv.value in (select distinct v from (select unnest(plans) v order by random() limit 2 + floor(random() * 4)::int) z)
      on conflict do nothing;
      if random() < 0.3 then insert into profile_lookup_values values (pid, 130, null) on conflict do nothing; end if;
      insert into profile_lookup_values values (pid, 131, null);
      if random() < 0.3 then insert into profile_lookup_values values (pid, other_lang[1 + floor(random() * array_length(other_lang, 1))::int], null) on conflict do nothing; end if;
      r := random();
      if r < 0.55 then
        insert into profile_lookup_values values (pid, 194, null), (pid, 195, null);
      elsif r < 0.8 then
        insert into profile_lookup_values values (pid, 195, null);
      else
        insert into profile_lookup_values values (pid, 194, null);
      end if;

      insert into licenses (profile_id, state, license_number, license_type, status, issued_date, expiration_date, notes, reviewed_at)
      values (pid, st, 'DEMO-' || upper(substr(replace(pid::text, '-', ''), 1, 7)),
        case when q in ('MD', 'DO') then 'Physician' else 'Licensed Psychologist' end, 'active',
        current_date - (400 + floor(random() * 3000)::int),
        current_date + case when k % 17 = 0 then 25 + floor(random() * 60)::int else 120 + floor(random() * 700)::int end,
        'Demo licence', now());
      if random() < 0.25 then
        insert into licenses (profile_id, state, license_number, license_type, status, expiration_date, notes, reviewed_at)
        values (pid, neighbours[s], 'DEMO-' || upper(substr(replace(pid::text, '-', ''), 8, 7)),
          case when q in ('MD', 'DO') then 'Physician' else 'Licensed Psychologist' end, 'active',
          current_date + 200 + floor(random() * 600)::int, 'Demo licence', now());
        update profiles set states_qualified = array[st, neighbours[s]] where id = pid;
      end if;

      ids := ids || pid;
      sts := sts || st;
    end loop;
  end loop;

  -- The cast: the same colleagues the guided tour shows.
  for cast_row in
    select * from (values
      (2, 'Maya Chen', 'PsyD', 'Brooklyn', 'demo/f04.svg', array[61, 7, 41], array[67, 280, 281], 'yes', 'yes', 3,
        'I work with adults living with trauma and anxiety, using CBT and EMDR, in person in Brooklyn and by telehealth across New York. I keep a small number of cover slots for colleagues on leave.'),
      (1, 'Eli Ramirez', 'MD', 'Manhattan', 'demo/m10.svg', array[16, 10, 7], array[287, 94], 'limited', 'yes', 6,
        'Psychiatrist in Manhattan. Medication management and consultation for mood and anxiety disorders, and split treatment with psychologists across New York.'),
      (4, 'Imani Brooks', 'PhD', 'Queens', 'demo/f05.svg', array[48, 7, 61], array[67, 279], 'yes', 'ask_me', 1,
        'Perinatal and postpartum mental health, anxiety and birth trauma. Adults, in person in Queens and virtually across New York.'),
      (3, 'Samuel Okafor', 'PhD', 'Brooklyn', 'demo/m11.svg', array[41, 7, 46], array[281, 67, 279], 'yes', 'ask_me', 8,
        'OCD, anxiety and phobias with ERP at the centre of my work. Evening telehealth and in-person sessions in Brooklyn.'),
      (6, 'Lena Park', 'PsyD', 'Albany', 'demo/f06.svg', array[41, 7, 16], array[281, 67], 'limited', 'no', 12,
        'OCD and anxiety specialist in Albany. PSYPACT telehealth across member states for selected referrals.')
    ) v(idx, nm, qual, city, avatar, focus, mods, ref, cov, days, bio)
  loop
    pid := (select array_agg(x) from unnest(ids) with ordinality u(x, o) where sts[o::int] = 'NY')[cast_row.idx];
    update profiles set full_name = split_part(full_name, ' ', 1) || ' Hale' where is_demo and full_name = cast_row.nm and id <> pid;
    update profiles set full_name = cast_row.nm, qualification_level = cast_row.qual::qualification_level, primary_practice_city = cast_row.city,
      avatar_path = cast_row.avatar, referral_availability = cast_row.ref, coverage_availability = cast_row.cov, consultation_availability = 'yes',
      accepting_referrals = cast_row.ref = 'yes', availability_confirmed_at = now() - (cast_row.days || ' days')::interval,
      availability_paused_until = null, approx_spaces = 2, bio = cast_row.bio,
      psypact_participating = cast_row.nm = 'Lena Park'
    where id = pid;
    update licenses set license_type = case when cast_row.qual = 'MD' then 'Physician' else 'Licensed Psychologist' end where profile_id = pid;
    delete from profile_lookup_values v using lookup_values lv
    where v.profile_id = pid and lv.id = v.lookup_value_id and lv.category in ('treatment_specialism', 'treatment_modality', 'age_group_specialism', 'session_type', 'insurance');
    insert into profile_lookup_values (profile_id, lookup_value_id, rank) select pid, x, o::int from unnest(cast_row.focus) with ordinality u(x, o);
    insert into profile_lookup_values (profile_id, lookup_value_id, rank) select pid, x, null from unnest(cast_row.mods) x;
    insert into profile_lookup_values (profile_id, lookup_value_id, rank) values (pid, 197, null), (pid, 194, null), (pid, 195, null), (pid, 103, null), (pid, 109, null)
    on conflict do nothing;
  end loop;
  pid := (select array_agg(x) from unnest(ids) with ordinality u(x, o) where sts[o::int] = 'NJ')[1];
  update profiles set full_name = split_part(full_name, ' ', 1) || ' Hale' where is_demo and full_name = 'Noah Patel' and id <> pid;
  update profiles set full_name = 'Noah Patel', qualification_level = 'PsyD', primary_practice_city = 'Jersey City', avatar_path = 'demo/m21.svg',
    availability_paused_until = current_date + 21, referral_availability = 'yes', availability_confirmed_at = now() - interval '8 days',
    bio = 'Anxiety and OCD for adults and young adults, virtual across New Jersey and New York. Taking a short break, back in three weeks.'
  where id = pid;

  -- Colleagues already know each other: trusted circles within a state.
  for i in 1..1200 loop
    for j in 1..(2 + floor(random() * 3)::int) loop
      a := ids[i];
      b := ids[1 + ((((i - 1) / 200) * 200) + floor(random() * 200)::int)];
      continue when a = b;
      insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)
      select a, b, 'trusted_colleague', 'accepted', now() - ((10 + random() * 300) || ' days')::interval, now() - ((5 + random() * 200) || ' days')::interval
      where not exists (select 1 from connections x where (x.requester_id = a and x.addressee_id = b) or (x.requester_id = b and x.addressee_id = a));
    end loop;
  end loop;

  for n in 1..1400 loop
    i := 1 + floor(random() * 1200)::int;
    a := ids[i];
    b := ids[1 + ((((i - 1) / 200) * 200) + floor(random() * 200)::int)];
    continue when a = b;
    insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, created_at)
    values ((array['coverage_completed', 'referral_outcome', 'consultation_response'])[1 + floor(random() * 3)::int], a, 'member_web', b, 'Demo activity', now() - ((5 + random() * 330) || ' days')::interval);
  end loop;
  for n in 1..1600 loop
    a := ids[1 + floor(random() * 1200)::int];
    insert into professional_events (event_type, actor_profile_id, actor_type, response_time_seconds, summary, created_at)
    values ((array['coverage_response', 'referral_response'])[1 + floor(random() * 2)::int], a, 'member_web',
      (600 + random() * random() * 170000)::int, 'Demo activity', now() - ((5 + random() * 330) || ' days')::interval);
  end loop;

  -- Wider-network discussions: specific, varied and de-identified.
  for cast_row in
    select * from (values
      ('How are you handling telehealth when a client relocates mid-treatment?', 'A long-standing client is moving from New York to Vermont in December. PSYPACT covers me for now; curious how others handle the transition and the emergency plan.', 'practice_question', array['Telehealth', 'Licensure']),
      ('First session after taking over from a colleague on leave', 'I am covering six weeks for a colleague. What do you do in that first session to make the change feel safe rather than abrupt?', 'termination_transfer', array['Trauma/PTSD', 'Private practice']),
      ('Adolescent disclosing self-harm but asking me not to tell parents', 'Sixteen-year-old, low current risk on assessment, strong alliance. Thinking through how to involve parents without losing the young person.', 'risk', array['Suicide', 'Ethics']),
      ('What goes in your coverage summary for a two-week absence?', 'Trying to standardise mine. Currently: presenting concern, risk level, current focus, next appointment, and who to call. What am I missing?', 'practice_question', array['Private practice']),
      ('Split-treatment agreements with psychiatrists: templates?', 'Starting to share several clients with a psychiatrist in my building. Looking for a sensible structure for who calls whom and how often.', 'medication_split_treatment', array['Depression', 'Documentation']),
      ('Setting out-of-network fees for couples work in 2026', 'Moving to self-pay for couples. How are others in Massachusetts and Connecticut pricing a 75-minute session?', 'practice_question', array['Marriage & Divorce', 'Billing & insurance']),
      ('ERP stalled after 20 sessions with a long-term OCD client', 'Good early gains, then avoidance has crept back into the hierarchy. Considering adding ACT. Has anyone found a way through this plateau?', 'treatment_impasse', array['Obsessive/Compulsive Disorder']),
      ('AI scribes: are you using them, and what consent do you get?', 'My group is piloting an ambient scribe. I want a consent conversation that is honest about where recordings go.', 'ethics_legal', array['Documentation', 'Ethics']),
      ('Closing the loop when a colleague has not confirmed intake', 'Referred an adult with panic disorder three weeks ago. No confirmation either way. How long before you follow up, and how?', 'referral_recommendation', array['Private practice']),
      ('How many clinical hours a week are you sustaining?', 'I am at 28 direct hours and feeling it by Thursday. Curious what others have found sustainable over years, not months.', 'other', array['Self-care & burnout']),
      ('Grief work with older adults after a spouse''s death', 'Several clients in their seventies this year. What has helped beyond the usual grief frameworks, particularly around isolation?', 'diagnostic_clarification', array['Grief/Loss', 'Aging']),
      ('Who is taking adult ADHD evaluations in the next month?', 'Two adult enquiries in Rhode Island needing a full evaluation, not just medication review. Waitlists here are long.', 'referral_recommendation', array['ADHD']),
      ('When do you bring in a psychiatrist for treatment-resistant depression?', 'Two adequate trials of therapy and one SSRI via the GP, little change. Where do you draw the line for a psychiatric consult?', 'medication_split_treatment', array['Depression']),
      ('Subpoena for psychotherapy notes: first steps?', 'First one in twelve years of practice, related to a custody matter in New Jersey. What did you do in the first 48 hours?', 'ethics_legal', array['Ethics', 'Documentation']),
      ('Level of care for college students with eating disorders', 'Outpatient feels thin for a student whose weight is dropping over the semester. How do you decide when to recommend IOP?', 'referral_recommendation', array['Eating Disorders']),
      ('Anyone running a group for new parents with postpartum anxiety?', 'I have four referrals who would benefit from a group more than individual work. Would love to hear what format has worked.', 'other', array['Anxiety/Panic Disorders', 'Pregnancy/Childbirth']),
      ('Rural Vermont: managing crisis plans with long travel distances', 'Nearest ED is 50 minutes for several of my clients. How do you build a safety plan that works with that geography?', 'risk', array['Suicide', 'Telehealth']),
      ('Exposure work for adolescents who refuse school', 'Families are exhausted and schools want a fast answer. How are others balancing graded exposure with pressure to return?', 'treatment_impasse', array['Anxiety/Panic Disorders', 'Parenting Issues']),
      ('Using measurement-based care without it feeling like paperwork', 'I want PHQ-9 and GAD-7 trends to inform the work, not interrupt it. What rhythm works for you?', 'practice_question', array['Depression', 'Documentation']),
      ('Couples where one partner is also in individual therapy with me', 'Asked to see a couple where I already see one partner individually. I lean towards referring the couple out. Thoughts?', 'ethics_legal', array['Marriage & Divorce', 'Ethics']),
      ('Trauma-focused work with first responders', 'Increasing referrals from firefighters in Connecticut. Any colleagues with experience of the culture and what helps engagement?', 'practice_question', array['Trauma/PTSD', 'Military']),
      ('Returning to practice after parental leave', 'Back in a month. How did you pace your caseload back up, and did you tell clients why you were away?', 'termination_transfer', array['Private practice', 'Pregnancy/Childbirth']),
      ('Bipolar II: coordinating with a prescriber who rarely replies', 'Client is doing well but the prescriber is hard to reach. How do you set expectations for communication in split care?', 'medication_split_treatment', array['Bipolar Disorder']),
      ('Group practice: fair split for contractors in 2026', 'Opening a small group in Providence. What percentage splits are people seeing for independent contractors?', 'practice_question', array['Private practice', 'Billing & insurance'])
    ) v(question, context, ctype, tags)
  loop
    a := ids[1 + floor(random() * 1200)::int];
    insert into consultations (author_profile_id, question, context, consultation_type, audience_type, tags, status, deidentification_confirmed, kind, created_at)
    values (a, cast_row.question, cast_row.context, cast_row.ctype, 'wider_network', cast_row.tags,
      case when random() < 0.2 then 'resolved' else 'open' end, true, 'question', now() - ((1 + random() * 25) || ' days')::interval)
    returning id into cons_id;
    for j in 1..(1 + floor(random() * 4)::int) loop
      b := ids[1 + floor(random() * 1200)::int];
      continue when b = a;
      insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, created_at)
      values (cons_id, b, 'reply',
        (array['I''ve found a short written summary plus one joint call works best. It keeps expectations clear on both sides.',
               'We use the Practice Library template as a starting point and adapt it. The debrief section is the part people skip and shouldn''t.',
               'I''d separate the clinical question from the logistics. Happy to talk it through by message.',
               'Same experience here. What changed things for me was agreeing a clear response window up front.',
               'Worth checking your state board''s guidance first; it changed on this last year.',
               'I''d refer out for that. I can suggest two colleagues if helpful.',
               'Our consultation group discussed exactly this last month. Short version: document the reasoning, not just the decision.',
               'I tried the opposite approach for a year and went back. Slower at the start, but fewer surprises later.',
               'A brief check-in call with the family first has saved me a lot of time on these.',
               'I track it monthly rather than weekly. Enough to see a trend without it taking over the session.'])[1 + floor(random() * 10)::int],
        now() - ((random() * 10) || ' days')::interval);
    end loop;
    update consultations set status = 'responses_received' where id = cons_id and status = 'open' and exists (select 1 from consultation_responses where consultation_id = cons_id);
  end loop;

  for n in 1..5 loop
    a := ids[1 + floor(random() * 1200)::int];
    insert into consultations (author_profile_id, question, context, audience_type, tags, status, deidentification_confirmed, kind, created_at)
    values (a,
      (array['Offering fortnightly supervision for early-career clinicians in CBT for anxiety',
             'Offering licensure-track supervision, trauma focus, telehealth available',
             'Offering peer supervision for psychiatrists doing split treatment',
             'Seeking weekly supervision towards licensure, child and adolescent focus',
             'Seeking consultative supervision for EMDR case conceptualisation'])[n],
      'Happy to share details by message.', 'wider_network', array['Supervision'], 'open', true,
      case when n <= 3 then 'supervision_offer' else 'supervision_request' end, now() - ((1 + random() * 20) || ' days')::interval);
  end loop;

  return (select count(*) from profiles where is_demo)::text || ' demo members';
end;
$function$;

-- The sandbox story for one prospect. Idempotent after clear_demo_viewer.
create or replace function private.seed_demo_viewer(p_viewer uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  maya uuid; eli uuid; imani uuid; samuel uuid; lena uuid; noah uuid;
  ny uuid[]; nj uuid[]; ct uuid[];
  a uuid; n int;
  new_id bigint; plan_id bigint; case_id bigint; ev_id bigint; conv_id bigint; grp_id bigint; cons_id bigint;
  leave_start date := (date_trunc('week', current_date + 28))::date + 7;
  leave_end date := (date_trunc('week', current_date + 28))::date + 48;
  plan_title text := 'Parental leave, six weeks';
begin
  select id into maya from profiles where is_demo and full_name = 'Maya Chen' and primary_state = 'NY';
  select id into eli from profiles where is_demo and full_name = 'Eli Ramirez' and primary_state = 'NY';
  select id into imani from profiles where is_demo and full_name = 'Imani Brooks' and primary_state = 'NY';
  select id into samuel from profiles where is_demo and full_name = 'Samuel Okafor' and primary_state = 'NY';
  select id into lena from profiles where is_demo and full_name = 'Lena Park' and primary_state = 'NY';
  select id into noah from profiles where is_demo and full_name = 'Noah Patel' and primary_state = 'NJ';
  select array_agg(p.id order by u.email) into ny from profiles p join auth.users u on u.id = p.id
    where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'NY' and p.id not in (maya, eli, imani, samuel, lena);
  select array_agg(p.id order by u.email) into nj from profiles p join auth.users u on u.id = p.id
    where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'NJ' and p.id <> noah;
  select array_agg(p.id order by u.email) into ct from profiles p join auth.users u on u.id = p.id
    where p.is_demo and u.email like '%@seed.psyalliance.test' and p.primary_state = 'CT';
  if maya is null or eli is null or samuel is null or coalesce(array_length(ny, 1), 0) < 30 then
    raise exception 'Seed the demo members first: select private.seed_demo_network(null);';
  end if;

  -- Alex's practice, complete, so the profile reads as a real one.
  update profiles set full_name = 'Alex Rivers', credential_prefix = 'Dr.', qualification_level = 'PsyD', primary_state = 'NY',
    primary_practice_city = 'Brooklyn', states_qualified = array['NY', 'NJ'], avatar_path = 'demo/f07.svg', psypact_participating = true,
    bio = 'I work with adults and adolescents living with anxiety, trauma and OCD, mostly CBT, ERP and EMDR. In person in Brooklyn and by telehealth across New York and New Jersey.',
    referral_availability = 'limited', coverage_availability = 'ask_me', consultation_availability = 'yes', accepting_referrals = true,
    availability_confirmed_at = now() - interval '3 days', availability_paused_until = null, approx_spaces = 2, directory_visible = true,
    open_to_group_consultation = true, practice_website = 'https://example.com/alex-rivers', contact_email = 'alex.rivers@example.com'
  where id = p_viewer;
  delete from profile_lookup_values where profile_id = p_viewer;
  insert into profile_lookup_values (profile_id, lookup_value_id, rank)
  values (p_viewer, 7, 1), (p_viewer, 61, 2), (p_viewer, 41, 3), (p_viewer, 16, 4),
         (p_viewer, 67, null), (p_viewer, 281, null), (p_viewer, 280, null), (p_viewer, 279, null),
         (p_viewer, 197, null), (p_viewer, 198, null), (p_viewer, 199, null),
         (p_viewer, 103, null), (p_viewer, 109, null), (p_viewer, 130, null),
         (p_viewer, 131, null), (p_viewer, 181, null), (p_viewer, 194, null), (p_viewer, 195, null);
  delete from licenses where profile_id = p_viewer;
  insert into licenses (profile_id, state, license_number, license_type, status, expiration_date, reviewed_at, notes)
  values (p_viewer, 'NY', 'DEMO-NY-0417', 'Licensed Psychologist', 'active', current_date + 420, now(), 'Fictional demo licence'),
         (p_viewer, 'NJ', 'DEMO-NJ-2208', 'Licensed Psychologist', 'active', current_date + 610, now(), 'Fictional demo licence');

  -- Circle: seven trusted colleagues, two invitations waiting, one sent.
  insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)
  select x, p_viewer, 'trusted_colleague', 'accepted', now() - ((40 + random() * 200) || ' days')::interval, now() - ((20 + random() * 100) || ' days')::interval
  from unnest(array[maya, samuel, ny[1], ny[2], ny[3], ny[4], nj[2]]) x;
  insert into connections (requester_id, addressee_id, tier, status, created_at)
  select x, p_viewer, 'trusted_colleague', 'pending', now() - ((1 + random() * 4) || ' days')::interval from unnest(array[imani, nj[3]]) x;
  insert into connections (requester_id, addressee_id, tier, status, created_at) values (p_viewer, ny[5], 'trusted_colleague', 'pending', now() - interval '2 days');
  insert into saved_clinicians (profile_id, clinician_id, note)
  select p_viewer, x, null from unnest(array[noah, lena, ny[6], nj[4], ct[1]]) x on conflict do nothing;

  insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, created_at)
  values ('coverage_completed', eli, 'member_web', p_viewer, 'Demo activity', now() - interval '60 days'),
         ('referral_outcome', samuel, 'member_web', p_viewer, 'Demo activity', now() - interval '35 days'),
         ('consultation_response', maya, 'member_web', p_viewer, 'Demo activity', now() - interval '20 days'),
         ('referral_outcome', eli, 'member_web', p_viewer, 'Demo activity', now() - interval '120 days');

  for a in select x from unnest(array[imani, nj[3]]) x loop
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('trusted_invitation_sent', a, 'member_web', 'invited you to their trusted circle', '/dashboard/network', '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
  end loop;

  -- Three referrals sent to Alex.
  for n in 1..3 loop
    a := (array[maya, eli, nj[2]])[n];
    insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
      notes, status, audience_type, audience_profile_ids, created_at)
    values (a, array(select unnest((array[array[61, 57], array[7, 35], array[7, 41]])[n:n])), (array[61, 7, 7])[n], (array['NY', 'NY', 'NJ'])[n], (array['Brooklyn', 'Manhattan', 'Jersey City'])[n],
      (array['Aetna', 'Self-pay (out of network)', 'UnitedHealthcare / Optum'])[n], (array['Adults', 'Young Adults', 'Adults'])[n],
      (array['either', 'in_person', 'virtual'])[n], (array['within_month', 'urgent', 'flexible'])[n],
      (array['Weekday evenings preferred. Happy to talk through fit first.', 'Needs someone soon; current clinician is relocating out of state.', 'Telehealth is fine. Works shifts, so flexibility on times helps.'])[n],
      'sent', case when n = 1 then 'trusted' else 'selected' end, array[p_viewer], now() - ((n * 1.5) || ' days')::interval)
    returning id into new_id;
    insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('referral_sent', a, 'member_web', 'sent you a referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
  end loop;

  -- Alex's own referral: three replies in, ready to choose.
  insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
    notes, status, audience_type, audience_profile_ids, created_at)
  values (p_viewer, array[41], 41, 'NY', 'Brooklyn', 'Aetna', 'Adults', 'either', 'within_month',
    'Adult, ERP experience needed, evenings preferred.', 'sent', 'selected', array[maya, samuel, lena], now() - interval '3 days')
  returning id into new_id;
  insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
  insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
  values (new_id, maya, 'interested', 'I have a Tuesday evening opening from next week.', now() - interval '2 days', now() - interval '2 days'),
         (new_id, samuel, 'interested', 'Happy to. I run ERP weekly and can start in two weeks.', now() - interval '1 day', now() - interval '1 day'),
         (new_id, lena, 'unavailable', 'Full until January, sorry.', now() - interval '1 day', now() - interval '1 day');
  for a in select x from unnest(array[maya, samuel]) x loop
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('referral_response', a, 'member_web', 'responded "interested" to your referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
  end loop;
  insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, age_band, modality, timeframe, status, audience_type, audience_profile_ids, created_at, closed_at)
  values (p_viewer, array[7], 7, 'NY', 'Brooklyn', 'Adults', 'in_person', 'flexible', 'closed', 'selected', array[samuel], now() - interval '40 days', now() - interval '33 days')
  returning id into new_id;
  insert into private.demo_rows (tbl, id, owner) values ('referral_requests', new_id, p_viewer);
  insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
  values (new_id, samuel, 'accepted', 'Yes, I can see them from next week.', now() - interval '39 days', now() - interval '39 days');

  -- An urgent cover request for Alex from a trusted colleague.
  insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
  values (ny[1], 'Unexpected absence, this week', 'unexpected', 'NY', 'parallel', 'active', current_date, current_date + 10, 'ad_hoc', now() - interval '6 hours')
  returning id into plan_id;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan_id, p_viewer);
  insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status)
  values (plan_id, 'Case 1', array[7], 'Adults', 'virtual', 'Self-pay (out of network)', 'Weekly', 'awaiting_response') returning id into case_id;
  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, message, sent_at)
  values (case_id, p_viewer, 1, 'sent', 'Family emergency, back in ten days. Could you hold two sessions? Summary to follow once you agree.', now() - interval '6 hours');
  insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status)
  values (plan_id, 'Case 2', array[61], 'Adults', 'either', 'Aetna', 'Weekly', 'awaiting_response') returning id into case_id;
  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, message, sent_at)
  values (case_id, p_viewer, 1, 'sent', 'Family emergency, back in ten days. Could you hold two sessions? Summary to follow once you agree.', now() - interval '6 hours');
  insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
  values ('coverage_request', ny[1], 'member_web', 'sent you a coverage request', '/dashboard/cover', '{"demo":true}') returning id into ev_id;
  insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());

  -- Alex's leave plan: one case covered, one out with Maya, one open.
  insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
  values (p_viewer, plan_title, 'extended_leave', 'NY', 'sequential', 'active', leave_start, leave_end, 'extended_leave', now() - interval '5 days')
  returning id into plan_id;
  insert into private.demo_rows (tbl, id, owner) values ('coverage_plans', plan_id, p_viewer);
  insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status, assigned_clinician_id)
  values (plan_id, 'Case 1', array[61], 'Adults', 'either', 'Aetna', 'Weekly', 'confirmed', maya) returning id into case_id;
  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, sent_at, responded_at)
  values (case_id, maya, 1, 'accepted', now() - interval '4 days', now() - interval '3 days');
  insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status, outreach_queue)
  values (plan_id, 'Case 2', array[7], 'Adolescents', 'virtual', 'Self-pay (out of network)', 'Weekly', 'awaiting_response', array[imani]) returning id into case_id;
  insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, sent_at)
  values (case_id, maya, 1, 'sent', now() - interval '1 day');
  insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, prescribing_needed, status)
  values (plan_id, 'Case 3', array[16], 'Adults', 'in_person', 'UnitedHealthcare / Optum', 'Fortnightly', true, 'needs_cover');
  insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
  values ('coverage_confirmed', maya, 'member_web', 'confirmed they can cover your case', '/dashboard/cover/' || plan_id || '?step=track', '{"demo":true}') returning id into ev_id;
  insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());

  -- Alex's question to the trusted circle.
  insert into consultations (author_profile_id, question, context, consultation_type, audience_type, tags, status, deidentification_confirmed, kind, created_at)
  values (p_viewer, 'How do you structure the handover call when a colleague covers mid-treatment?',
    'Planning six weeks of leave and want the transition to feel steady for clients.', 'termination_transfer', 'trusted', array['Private practice'], 'responses_received', true, 'question', now() - interval '2 days')
  returning id into cons_id;
  insert into private.demo_rows (tbl, id, owner) values ('consultations', cons_id, p_viewer);
  insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, created_at)
  values (cons_id, maya, 'reply', 'A 20-minute joint call before leave starts, then a written summary. PA-02 has a checklist.', now() - interval '1 day'),
         (cons_id, eli, 'reply', 'Tell clients in writing who to contact and when. It''s the ambiguity that unsettles people.', now() - interval '20 hours');
  for a in select x from unnest(array[maya, eli]) x loop
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('consultation_response', a, 'member_web', 'replied to your consultation', '/dashboard/consult/' || cons_id, '{"demo":true}') returning id into ev_id;
    insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
  end loop;
  insert into consult_tag_follows (profile_id, tag) values (p_viewer, 'Trauma/PTSD'), (p_viewer, 'Private practice') on conflict do nothing;

  -- Thursday Circle, Alex's consultation group, and an invitation to another.
  insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
  values ('Thursday Circle', 'Weekly peer consultation for Brooklyn clinicians working with trauma and anxiety', maya, 'Weekly, Thursdays', 'video',
    'Members only. Cases are always de-identified. This is consultation, not supervision: the treating clinician decides. No recording or transcription. Present cases using the PA-05 format.', 2)
  returning id into grp_id;
  insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', grp_id, p_viewer);
  insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
  values (grp_id, maya, 'joined', 'creator', now()), (grp_id, p_viewer, 'joined', 'member', now()),
         (grp_id, samuel, 'joined', 'member', now()), (grp_id, ny[1], 'joined', 'member', now()), (grp_id, eli, 'joined', 'member', now());
  insert into consultations (author_profile_id, question, context, consultation_type, audience_type, group_id, status, deidentification_confirmed, kind, created_at)
  values (samuel, 'Adult with complex trauma dissociating in session: pacing EMDR preparation', 'Broad context only; happy to discuss on Thursday.', 'treatment_impasse', 'selected', grp_id, 'responses_received', true, 'question', now() - interval '4 days')
  returning id into cons_id;
  insert into consultation_responses (consultation_id, responder_profile_id, body, created_at)
  values (cons_id, maya, 'I''d extend resourcing and check the window of tolerance each session before any processing.', now() - interval '3 days'),
         (cons_id, ny[1], 'Grounding objects helped one of mine. Agree on slowing down.', now() - interval '2 days');
  insert into consultations (author_profile_id, question, audience_type, group_id, status, deidentification_confirmed, kind, created_at)
  values (maya, 'Agenda for next Thursday: vicarious trauma and caseload limits', 'selected', grp_id, 'open', true, 'question', now() - interval '1 day');

  insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
  values ('Hudson Child & Adolescent Peer Group', 'Fortnightly peer consultation on child and adolescent cases across New York and New Jersey', nj[3], 'Every two weeks', 'hybrid',
    'Members only. De-identified cases. Consultation, not supervision. Parents and schools are discussed only in general terms.', 1)
  returning id into grp_id;
  insert into private.demo_rows (tbl, id, owner) values ('consultation_groups', grp_id, p_viewer);
  insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
  values (grp_id, nj[3], 'joined', 'creator', now()), (grp_id, nj[2], 'joined', 'member', now()), (grp_id, ny[2], 'joined', 'member', now());
  insert into consultation_group_members (group_id, profile_id, status, role) values (grp_id, p_viewer, 'invited', 'member');
  insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
  values ('consultation_invite', nj[3], 'member_web', 'invited you to join the Hudson Child & Adolescent Peer Group', '/dashboard/consult/groups/' || grp_id, '{"demo":true}') returning id into ev_id;
  insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());

  -- Conversations, each attached to what it is about.
  insert into conversations (created_by, title, created_at, last_message_at)
  values (maya, 'Cover · ' || plan_title, now() - interval '3 days', now() - interval '3 hours') returning id into conv_id;
  insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
  insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, maya, now()), (conv_id, p_viewer, now() - interval '1 day');
  insert into conversation_messages (conversation_id, author_id, body, created_at)
  values (conv_id, maya, 'Happy to take Cases 1 and 2. Can we do the handover call the week before you go?', now() - interval '3 days'),
         (conv_id, p_viewer, 'Yes please. Thursday 9 AM? I''ll send the PA-02 summaries through our usual secure email.', now() - interval '2 days'),
         (conv_id, maya, 'Thursday at 9 works. I''ll block the time.', now() - interval '3 hours');
  insert into conversations (created_by, title, created_at, last_message_at)
  values (samuel, 'Referral · Obsessive/Compulsive Disorder · Brooklyn, NY', now() - interval '1 day', now() - interval '5 hours') returning id into conv_id;
  insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
  insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, samuel, now()), (conv_id, p_viewer, now() - interval '1 day');
  insert into conversation_messages (conversation_id, author_id, body, created_at)
  values (conv_id, samuel, 'Thanks for thinking of me for this one. I have Tuesday and Thursday evenings.', now() - interval '1 day'),
         (conv_id, samuel, 'Happy to do a brief call with you first if that helps.', now() - interval '5 hours');
  insert into conversations (created_by, title, created_at, last_message_at)
  values (eli, 'Cover · Prescribing for Case 3', now() - interval '6 days', now() - interval '5 days') returning id into conv_id;
  insert into private.demo_rows (tbl, id, owner) values ('conversations', conv_id, p_viewer);
  insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, eli, now()), (conv_id, p_viewer, now());
  insert into conversation_messages (conversation_id, author_id, body, created_at)
  values (conv_id, eli, 'Saw your plan. If Case 3 needs a medication review while you''re away, I can see them fortnightly in Manhattan.', now() - interval '6 days'),
         (conv_id, p_viewer, 'That would be ideal. I''ll send the request through the plan so it''s all in one place.', now() - interval '5 days');
  insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
  values ('message_received', maya, 'member_web', 'sent you a message', '/dashboard/messages', '{"demo":true}') returning id into ev_id;
  insert into private.demo_rows (tbl, id, owner) values ('notification_events', ev_id, p_viewer);
  insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_viewer, 'in_app', 'sent', now());
end;
$function$;

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
  perform private.delete_sandbox_guest(pass.guest_id);

  gmail := 'guest-' || substr(replace(gid::text, '-', ''), 1, 12) || '@sandbox.psyalliance.test';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gid, 'authenticated', 'authenticated', gmail,
    crypt(pw, gen_salt('bf')), now(), '', '', '', '',
    '{"provider":"email","providers":["email"],"created_by_system":"true"}'::jsonb,
    jsonb_build_object('full_name', 'Alex Rivers'), false, false, now(), now());
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), gid, gid::text, 'email', jsonb_build_object('sub', gid::text, 'email', gmail, 'email_verified', true), now(), now(), now());

  insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified,
    verification_status, verified_at, is_demo, account_status, account_kind, directory_visible)
  values (gid, 'Alex Rivers', 'Dr.', 'PsyD', 'NY', 'Brooklyn', array['NY', 'NJ'], 'verified', now(), true, 'active', 'clinician', true)
  on conflict (id) do nothing;

  perform private.seed_demo_viewer(gid);
  update sandbox_passes set guest_id = gid, claimed_at = now(), claims = claims + 1 where id = pass.id;
  return query select gmail, pw, pass.expires_at;
end;
$function$;

-- Network directory, one row per person, filtered and paged in the
-- database. Security invoker: it reads public_directory, so every row a
-- member can't see stays invisible.
create or replace function public.network_directory(p jsonb default '{}'::jsonb)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with lic as (select profile_id, states from public.network_licence_states()),
  ppl as (
    select d.id,
      min(d.full_name) full_name, min(d.credential_prefix) credential_prefix, min(d.qualification_level::text) qualification_level,
      min(d.primary_practice_city) city, min(d.primary_state) state, bool_or(d.psypact_participating) psypact,
      min(d.referral_availability) referral_availability, max(d.availability_confirmed_at) confirmed_at, min(d.avatar_path) avatar_path,
      coalesce(array_agg(d.value order by d.rank nulls last, d.value) filter (where d.category = 'treatment_specialism'), '{}') focus,
      coalesce(array_agg(d.value) filter (where d.category = 'insurance'), '{}') insurance,
      coalesce(array_agg(d.value) filter (where d.category = 'age_group_specialism'), '{}') ages,
      coalesce(array_agg(d.value) filter (where d.category = 'language'), '{}') languages,
      coalesce(array_agg(d.value) filter (where d.category = 'treatment_modality'), '{}') modalities,
      coalesce(array_agg(d.value) filter (where d.category = 'session_type'), '{}') sessions
    from public.public_directory d
    where d.id <> auth.uid()
    group by d.id
  ),
  visible as (
    select ppl.*, coalesce(lic.states, '{}') lic_states,
      (ppl.referral_availability = 'yes' and ppl.confirmed_at >= now() - interval '30 days') fresh
    from ppl left join lic on lic.profile_id = ppl.id
    where not (ppl.id::text in (select jsonb_array_elements_text(coalesce(p -> 'exclude', '[]'))))
  ),
  f as (
    select v.* from visible v
    where (p -> 'only' is null or v.id::text in (select jsonb_array_elements_text(p -> 'only')))
      and (coalesce(p ->> 'q', '') = '' or v.full_name ilike '%' || (p ->> 'q') || '%'
           or exists (select 1 from unnest(v.focus || v.languages || v.modalities) x where x ilike '%' || (p ->> 'q') || '%'))
      and (coalesce(p ->> 'focus', '') = '' or (p ->> 'focus') = any (v.focus))
      and (coalesce(p ->> 'state', '') = '' or v.state = (p ->> 'state') or (p ->> 'state') = any (v.lic_states))
      and (coalesce((p ->> 'available')::boolean, false) = false or v.fresh)
      and (coalesce(p ->> 'profession', '') = '' or ((p ->> 'profession') = 'psychiatrist') = (v.qualification_level in ('MD', 'DO')))
      and (coalesce(p ->> 'insurance', '') = '' or (p ->> 'insurance') = any (v.insurance))
      and (coalesce(p ->> 'age', '') = '' or (p ->> 'age') = any (v.ages))
      and (coalesce(p ->> 'language', '') = '' or (p ->> 'language') = any (v.languages))
      and (coalesce(p ->> 'modality', '') = '' or (p ->> 'modality') = any (v.modalities))
      and (coalesce(p ->> 'session', '') = '' or (p ->> 'session') = any (v.sessions))
      and (coalesce((p ->> 'psypact')::boolean, false) = false or v.psypact)
  ),
  ranked as (
    select f.*, row_number() over (
      order by (f.id::text in (select jsonb_array_elements_text(coalesce(p -> 'first', '[]')))) desc, f.fresh desc, f.full_name) ord
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'all', (select count(*) from visible),
    'people', coalesce((
      select jsonb_agg(to_jsonb(r) - 'insurance' - 'ages' - 'sessions' order by r.ord) from ranked r
      where r.ord > coalesce((p ->> 'offset')::int, 0) and r.ord <= coalesce((p ->> 'offset')::int, 0) + coalesce((p ->> 'limit')::int, 25)
    ), '[]'::jsonb),
    'options', case when coalesce((p ->> 'with_options')::boolean, false) then jsonb_build_object(
      'focus', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.focus) x),
      'insurance', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.insurance) x),
      'age', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.ages) x),
      'language', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.languages) x),
      'modality', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.modalities) x),
      'session', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.sessions) x),
      'states', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.lic_states || array[visible.state]) x where x is not null)
    ) end
  );
$function$;

-- The candidate pool for the matching engine, pre-filtered by state and
-- focus, with each person's practice facts attached. Security invoker.
create or replace function public.match_pool(p_state text, p_focus integer[], p_telehealth boolean)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with lic as (select profile_id, states from public.network_licence_states()),
  c as (
    select p.id, p.full_name, p.credential_prefix, p.qualification_level::text qualification_level, p.primary_state, p.primary_practice_city,
      p.psypact_participating, p.referral_availability, p.coverage_availability, p.availability_confirmed_at, p.availability_paused_until,
      p.approx_spaces, p.last_active_at, p.open_to_give_supervision, p.avatar_path, lic.states
    from public.profiles p join lic on lic.profile_id = p.id
    where p.verification_status = 'verified' and p.account_status = 'active' and p.account_kind = 'clinician'
      and p.is_demo = public.viewer_is_demo() and p.id <> auth.uid()
      and (p_state is null or upper(p_state) = any (lic.states) or (coalesce(p_telehealth, true) and p.psypact_participating))
      and (coalesce(cardinality(p_focus), 0) = 0
           or exists (select 1 from public.profile_lookup_values v where v.profile_id = p.id and v.lookup_value_id = any (p_focus)))
  )
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('facts', (
    select coalesce(jsonb_agg(jsonb_build_object('id', v.lookup_value_id, 'rank', v.rank, 'cat', lv.category, 'val', lv.value)), '[]')
    from public.profile_lookup_values v join public.lookup_values lv on lv.id = v.lookup_value_id
    where v.profile_id = c.id))), '[]'::jsonb)
  from c;
$function$;

-- What the network can actually answer: states with at least ten members
-- open to referrals, and specialties with at least three such members in
-- every one of those states. The demo site offers only these.
create or replace function public.network_coverage()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with lic as (select profile_id, states from public.network_licence_states()),
  m as (
    select p.id, lic.states from public.profiles p join lic on lic.profile_id = p.id
    where p.verification_status = 'verified' and p.account_status = 'active' and p.account_kind = 'clinician'
      and p.is_demo = public.viewer_is_demo() and p.id <> auth.uid()
      and p.referral_availability in ('yes', 'limited') and p.availability_confirmed_at >= now() - interval '90 days'
  ),
  st as (select x st from m, unnest(m.states) x group by x having count(*) >= 10),
  fc as (
    select v.lookup_value_id id, s.st, count(distinct m.id) n
    from m join public.profile_lookup_values v on v.profile_id = m.id
    join public.lookup_values lv on lv.id = v.lookup_value_id and lv.category = 'treatment_specialism'
    join st s on s.st = any (m.states)
    group by 1, 2
  ),
  vals as (
    select lv.category, lv.id, count(distinct m.id) n
    from m join public.profile_lookup_values v on v.profile_id = m.id join public.lookup_values lv on lv.id = v.lookup_value_id
    where lv.category in ('insurance', 'language')
    group by 1, 2
  )
  select jsonb_build_object(
    'states', (select coalesce(jsonb_agg(st order by st), '[]') from st),
    'focus', (select coalesce(jsonb_agg(id order by id), '[]') from (
      select id from fc group by id having count(*) = (select count(*) from st) and min(n) >= 3) z),
    'insurance', (select coalesce(jsonb_agg(id order by id), '[]') from vals where category = 'insurance' and n >= 10),
    'language', (select coalesce(jsonb_agg(id order by id), '[]') from vals where category = 'language' and n >= 3)
  );
$function$;

revoke execute on function public.network_directory(jsonb), public.match_pool(text, integer[], boolean), public.network_coverage() from public, anon;
grant execute on function public.network_directory(jsonb), public.match_pool(text, integer[], boolean), public.network_coverage() to authenticated;

alter function private.safe_deep_link(text) set search_path = pg_catalog;
