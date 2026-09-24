-- Demo network: 120 fake, clearly-labelled members (40 NY, 40 MA, 40 TX)
-- with realistic practice facts, reviewed demo licences, relationships and
-- activity, plus activity around one real account so every feature can be
-- seen in use. Demo members are invisible to real members (is_demo parity);
-- a real account sees them only with profiles.demo_view switched on.
--
--   select private.seed_demo_network('<profile id>');   -- (re)build
--   select private.purge_demo_network();                -- remove it all

create table if not exists private.demo_rows (tbl text not null, id bigint not null);

create or replace function private.purge_demo_network()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from referral_requests where id in (select id from private.demo_rows where tbl = 'referral_requests');
  delete from coverage_plans where id in (select id from private.demo_rows where tbl = 'coverage_plans');
  delete from consultations where id in (select id from private.demo_rows where tbl = 'consultations');
  delete from private.demo_rows;
  delete from notification_events where metadata ->> 'demo' = 'true'
    or actor_profile_id in (select id from profiles where is_demo);
  delete from professional_events
  where actor_profile_id in (select id from profiles where is_demo)
     or related_profile_id in (select id from profiles where is_demo)
     or subject_profile_id in (select id from profiles where is_demo);
  delete from auth.users where email like '%@seed.psyalliance.test';
end;
$$;

create or replace function private.seed_demo_network(p_nick uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f_names text[] := array['Sarah','Emily','Jessica','Rachel','Laura','Megan','Priya','Aisha','Mei','Sofia','Elena','Grace','Hannah','Olivia','Maya','Leah','Nadia','Claire','Anna','Rebecca',
    'Julia','Naomi','Amara','Yasmin','Keiko','Lucia','Isabel','Tamara','Monica','Diana','Fatima','Ines','Zara','Helen','Ruth','Alicia','Joanna','Esther','Victoria','Chloe',
    'Beatriz','Simone','Imani','Farah','Linh','Rosa','Nora','Gabriela','Kavya','Lena','Miriam','Adriana','Talia','Noor','Camille','Renee','Sabrina','Ingrid','Paula','Carmen'];
  m_names text[] := array['Michael','David','James','Daniel','Andrew','Ryan','Carlos','Omar','Wei','Diego','Marcus','Samuel','Jonathan','Benjamin','Ethan','Aaron','Hiroshi','Rafael','Kwame','Tomas',
    'Nathan','Adrian','Victor','Julian','Elias','Arjun','Mateo','Felix','Hassan','Luis','Owen','Simon','Theo','Isaac','Gabriel','Ravi','Andre','Peter','Joel','Martin',
    'Colin','Dmitri','Kenji','Emeka','Sanjay','Pablo','Graham','Leon','Jamal','Stefan','Ivan','Moses','Reuben','Declan','Hugo','Anton','Idris','Marco','Paolo','Tobias'];
  l_names text[] := array['Chen','Patel','Garcia','Nguyen','Kim','Rodriguez','Okafor','Rossi','Singh','Haddad','Levy','Cohen','Murphy','Sullivan','Brennan','Walsh','Novak','Silva','Reyes','Castillo',
    'Ramirez','Morales','Ortiz','Bianchi','Moreau','Schmidt','Larsson','Kowalski','Petrov','Osei','Mensah','Abara','Khan','Ali','Rahman','Tanaka','Ito','Park','Lee','Choi',
    'Hughes','Bennett','Carter','Foster','Hayes','Howard','Hughes','Jordan','Keller','Lawson','Mitchell','Nelson','Porter','Reed','Russell','Shaw','Stone','Turner','Warren','Wells',
    'Adler','Baxter','Coleman','Dalton','Ellis','Fischer','Gordon','Hart','Irwin','Jensen','Klein','Lowe','Marsh','Nolan','Owens','Pierce','Quinn','Ross','Stein','Thorne'];
  states text[] := array['NY','MA','TX'];
  state_names text[] := array['New York','Massachusetts','Texas'];
  ny_cities text[] := array['New York','Brooklyn','Queens','White Plains','Albany','Buffalo','Rochester','Syracuse'];
  ma_cities text[] := array['Boston','Cambridge','Somerville','Brookline','Newton','Worcester','Springfield','Lowell'];
  tx_cities text[] := array['Austin','Houston','Dallas','San Antonio','Fort Worth','Plano','El Paso','Round Rock'];
  common_spec int[] := array[7,16,61,2,24,36,27,41,21,1,10,45,35,57,34,44,58,12];
  common_mod int[] := array[67,71,94,98,82,97,81,96,64,86];
  other_lang int[] := array[181,181,181,140,171,151,179,159,135,192,167,191,176,152,158];
  ids uuid[] := '{}';
  sts text[] := '{}';
  s int; i int; k int; idx int; g text; fn text; ln text; pid uuid; q text; st text; city text;
  r float; ref_av text; cov_av text; con_av text; conf timestamptz; spaces int; spec int[]; mods int[]; ages int[];
  spec_names text[]; mod_names text[]; age_names text[]; bio text; t int;
  a uuid; b uuid; c uuid; n int; j int;
  new_id bigint; plan_id bigint; case_id bigint; ev_id bigint; conv_id bigint; grp_id bigint; cons_id bigint;
  trusted uuid[]; tx_ids uuid[]; ma_ids uuid[]; ny_ids uuid[];
begin
  perform setseed(0.4242);
  perform private.purge_demo_network();

  -- -------------------------------------------------- 120 demo members
  for s in 1..3 loop
    st := states[s];
    for i in 1..40 loop
      k := (s - 1) * 40 + i;
      g := case when k % 2 = 0 then 'f' else 'm' end;
      idx := case when g = 'f' then k / 2 else (k + 1) / 2 end;
      fn := case when g = 'f' then f_names[idx] else m_names[idx] end;
      ln := l_names[1 + ((k * 37) % array_length(l_names, 1))];
      city := case st when 'NY' then ny_cities[1 + (i % 8)] when 'MA' then ma_cities[1 + (i % 8)] else tx_cities[1 + (i % 8)] end;
      pid := gen_random_uuid();
      r := random();
      q := case when r < 0.42 then 'PhD' when r < 0.72 then 'PsyD' when r < 0.77 then 'EdD' when r < 0.95 then 'MD' else 'DO' end;

      -- availability, with realistic freshness
      r := random();
      if r < 0.6 then conf := now() - (random() * 27 || ' days')::interval;
      elsif r < 0.85 then conf := now() - ((31 + random() * 55) || ' days')::interval;
      elsif r < 0.95 then conf := now() - ((95 + random() * 60) || ' days')::interval;
      else conf := null; end if;
      r := random();
      ref_av := case when conf is null then null when r < 0.5 then 'yes' when r < 0.75 then 'limited' when r < 0.9 then 'no' else 'yes' end;
      r := random();
      cov_av := case when conf is null then null when r < 0.45 then 'yes' when r < 0.8 then 'ask_me' else 'no' end;
      con_av := case when conf is null then null when random() < 0.8 then 'yes' else 'no' end;
      spaces := case when ref_av in ('yes', 'limited') and random() < 0.7 then floor(random() * 6)::int end;

      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', pid, 'authenticated', 'authenticated',
        'demo-' || lower(fn) || '.' || lower(ln) || '-' || k || '@seed.psyalliance.test',
        crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
        now() - ((30 + random() * 360) || ' days')::interval, now());

      -- practice facts
      select array_agg(x) into spec from (
        select x from generate_series(1, 62) x
        order by random() * case when x = any (common_spec) then 0.25 else 1 end
        limit 3 + floor(random() * 3)::int) z;
      select array_agg(x) into mods from (
        select x from generate_series(63, 102) x
        order by random() * case when x = any (common_mod) then 0.2 else 1 end
        limit 2 + floor(random() * 3)::int) z;
      select array_agg(x) into ages from (
        select x from generate_series(196, 200) x
        order by random() * case when x in (197, 198) then 0.3 else 1 end
        limit 1 + floor(random() * 3)::int) z;
      select array_agg(value order by array_position(spec, id::int)) into spec_names from lookup_values where id = any (spec);
      select array_agg(value order by array_position(mods, id::int)) into mod_names from lookup_values where id = any (mods);
      select array_agg(lower(value) order by id desc) into age_names from lookup_values where id = any (ages);

      t := 1 + floor(random() * 3)::int;
      bio := case t
        when 1 then 'I work with ' || array_to_string(age_names, ' and ') || ' navigating ' || spec_names[1] || ' and ' || spec_names[2]
          || ', mostly using ' || mod_names[1] || '. I see people in person in ' || city || ' and by telehealth across ' || state_names[s] || '.'
        when 2 then (case when q in ('MD', 'DO') then 'Psychiatrist' else 'Psychologist' end) || ' in ' || city || ' focused on ' || spec_names[1]
          || ', ' || spec_names[2] || ' and ' || spec_names[3] || '. My approach draws on ' || mod_names[1] || ' and ' || mod_names[2] || '.'
        else 'Most of my practice is ' || spec_names[1] || ' with ' || array_to_string(age_names, ' and ') || '. I also take referrals for '
          || spec_names[2] || '. ' || mod_names[1] || '-informed, collaborative and practical.' end;

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
        q not in ('MD', 'DO') and random() < 0.4, 'demo/' || g || lpad(idx::text, 2, '0') || '.svg',
        coalesce(ref_av, 'yes'), coalesce(cov_av, 'ask_me'), coalesce(con_av, 'yes'), conf, spaces,
        case when k in (9, 47, 88, 113) then current_date + (10 + floor(random() * 30)::int) end,
        bio, true, 'active', now() - ((30 + random() * 360) || ' days')::interval);

      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, o::int from unnest(spec) with ordinality as u(x, o);
      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, null from unnest(mods) x;
      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, null from unnest(ages) x;
      insert into profile_lookup_values (profile_id, lookup_value_id, rank)
      select pid, x, null from (select x from generate_series(103, 128) x order by random() limit 2 + floor(random() * 4)::int) z;
      if random() < 0.25 then insert into profile_lookup_values values (pid, 130, null); end if;
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

      -- reviewed demo licences (a few expiring soon, some multi-state)
      insert into licenses (profile_id, state, license_number, license_type, status, issued_date, expiration_date, notes, reviewed_at)
      values (pid, st, 'DEMO-' || upper(substr(replace(pid::text, '-', ''), 1, 7)),
        case when q in ('MD', 'DO') then 'Physician' else 'Licensed Psychologist' end, 'active',
        current_date - (400 + floor(random() * 3000)::int),
        current_date + case when k % 17 = 0 then 25 + floor(random() * 60)::int else 120 + floor(random() * 700)::int end,
        'Demo licence', now());
      if random() < 0.2 then
        insert into licenses (profile_id, state, license_number, license_type, status, expiration_date, notes, reviewed_at)
        values (pid, states[1 + (s % 3)], 'DEMO-' || upper(substr(replace(pid::text, '-', ''), 8, 7)),
          case when q in ('MD', 'DO') then 'Physician' else 'Licensed Psychologist' end, 'active',
          current_date + 200 + floor(random() * 600)::int, 'Demo licence', now());
        update profiles set states_qualified = array[st, states[1 + (s % 3)]] where id = pid;
      end if;

      ids := ids || pid;
      sts := sts || st;
    end loop;
  end loop;

  select array_agg(x) into ny_ids from unnest(ids) with ordinality u(x, o) where sts[o::int] = 'NY';
  select array_agg(x) into ma_ids from unnest(ids) with ordinality u(x, o) where sts[o::int] = 'MA';
  select array_agg(x) into tx_ids from unnest(ids) with ordinality u(x, o) where sts[o::int] = 'TX';

  -- ------------------------------------------ demo-to-demo relationships
  for i in 1..120 loop
    for j in 1..(2 + floor(random() * 3)::int) loop
      a := ids[i];
      b := ids[1 + ((((i - 1) / 40) * 40) + floor(random() * 40)::int)];
      continue when a = b;
      insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)
      select a, b, 'trusted_colleague', 'accepted', now() - ((10 + random() * 300) || ' days')::interval, now() - ((5 + random() * 200) || ' days')::interval
      where not exists (select 1 from connections x where (x.requester_id = a and x.addressee_id = b) or (x.requester_id = b and x.addressee_id = a));
    end loop;
  end loop;

  -- completed work and response times (feeds "worked with" and profile signals)
  for n in 1..220 loop
    i := 1 + floor(random() * 120)::int;
    a := ids[i];
    b := ids[1 + ((((i - 1) / 40) * 40) + floor(random() * 40)::int)];
    continue when a = b;
    insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, created_at)
    values ((array['coverage_completed', 'referral_outcome', 'consultation_response'])[1 + floor(random() * 3)::int], a, 'member_web', b, 'Demo activity', now() - ((5 + random() * 330) || ' days')::interval);
  end loop;
  for n in 1..260 loop
    a := ids[1 + floor(random() * 120)::int];
    insert into professional_events (event_type, actor_profile_id, actor_type, response_time_seconds, summary, created_at)
    values ((array['coverage_response', 'referral_response'])[1 + floor(random() * 2)::int], a, 'member_web',
      (600 + random() * random() * 170000)::int, 'Demo activity', now() - ((5 + random() * 330) || ' days')::interval);
  end loop;

  -- -------------------------------------------- the demo network talking
  -- wider-network discussions with replies
  for n in 1..16 loop
    a := ids[1 + floor(random() * 120)::int];
    insert into consultations (author_profile_id, question, context, consultation_type, audience_type, tags, status, deidentification_confirmed, kind, created_at)
    values (a,
      (array['How are you handling telehealth across state lines now that PSYPACT has expanded?',
             'Anyone found a good structure for the first session after a colleague''s extended leave handoff?',
             'Adolescent client disclosing self-harm to me but not to parents: how are you thinking about confidentiality?',
             'What do you include in a coverage summary for a colleague covering two weeks?',
             'Recommendations for a split-treatment agreement template with a psychiatrist?',
             'How are people setting fees for out-of-network couples work in 2026?',
             'Treatment impasse with a long-term OCD client: ERP stalled after 20 sessions. Ideas?',
             'Documentation standard for AI scribes: are you using them, and what consent do you get?',
             'Good ways to close the loop after a referral when the colleague hasn''t confirmed intake?',
             'Burnout check: how many clinical hours a week are you sustaining?',
             'Grief work with older adults after a spouse''s death: what''s helped your clients most?',
             'ADHD assessment waitlists: who is taking adult evaluations in the next month?',
             'When do you bring in a psychiatrist for treatment-resistant depression?',
             'Handling a subpoena for psychotherapy notes: first steps?',
             'Eating disorder referrals for college students: level-of-care questions',
             'Anyone running a group for new parents with postpartum anxiety?'])[n],
      'Broad, de-identified context only. Interested in how colleagues approach this in their own practice.',
      (array['practice_question', 'termination_transfer', 'risk', 'practice_question', 'medication_split_treatment', 'practice_question', 'treatment_impasse', 'ethics_legal',
             'referral_recommendation', 'other', 'diagnostic_clarification', 'referral_recommendation', 'medication_split_treatment', 'ethics_legal', 'referral_recommendation', 'other'])[n],
      'wider_network',
      (array[array['Telehealth', 'Licensure'], array['Trauma/PTSD', 'Private practice'], array['Suicide', 'Ethics'], array['Private practice', ''], array['Depression', 'Documentation'],
             array['Marriage & Divorce', 'Billing & insurance'], array['Obsessive/Compulsive Disorder', ''], array['Documentation', 'Ethics'], array['Private practice', ''],
             array['Self-care & burnout', ''], array['Grief/Loss', 'Aging'], array['ADHD', ''], array['Depression', ''], array['Ethics', 'Documentation'], array['Eating Disorders', ''], array['Anxiety/Panic Disorders', 'Pregnancy/Childbirth']])[n:n],
      case when n % 5 = 0 then 'resolved' else 'open' end, true, 'question', now() - ((1 + random() * 25) || ' days')::interval)
    returning id into cons_id;
    update consultations set tags = array(select x from unnest(tags) x where x <> '') where id = cons_id;
    for j in 1..(1 + floor(random() * 4)::int) loop
      b := ids[1 + floor(random() * 120)::int];
      continue when b = a;
      insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, created_at)
      values (cons_id, b, 'reply',
        (array['I''ve found a short written summary plus one joint call works best. Keeps expectations clear on both sides.',
               'We use the PA-01 template as a starting point and adapt it. The debrief section is the part people skip and shouldn''t.',
               'I''d separate the clinical question from the logistics. Happy to talk it through by message.',
               'Same experience here. What changed things for me was setting a clear response window up front.',
               'Worth checking your state board''s guidance first; it moved on this last year.',
               'I''d refer out for that. I can suggest two colleagues if helpful.',
               'Consultation group discussed exactly this last month. Short version: document the reasoning, not just the decision.'])[1 + floor(random() * 7)::int],
        now() - ((random() * 10) || ' days')::interval);
    end loop;
    update consultations set status = 'responses_received' where id = cons_id and status = 'open' and exists (select 1 from consultation_responses where consultation_id = cons_id);
  end loop;

  -- supervision offers and requests
  for n in 1..5 loop
    a := ids[1 + floor(random() * 120)::int];
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

  -- ------------------------------------ activity around the real account
  if p_nick is not null and exists (select 1 from profiles where id = p_nick) then
    update profiles set demo_view = true where id = p_nick;

    -- trusted circle, invitations, saved
    trusted := array[tx_ids[1], tx_ids[4], tx_ids[7], ma_ids[2], ma_ids[5], ny_ids[3], ny_ids[8]];
    insert into connections (requester_id, addressee_id, tier, status, created_at, responded_at)
    select x, p_nick, 'trusted_colleague', 'accepted', now() - ((20 + random() * 200) || ' days')::interval, now() - ((10 + random() * 100) || ' days')::interval
    from unnest(trusted) x;
    insert into connections (requester_id, addressee_id, tier, status, created_at)
    select x, p_nick, 'trusted_colleague', 'pending', now() - ((1 + random() * 5) || ' days')::interval
    from unnest(array[tx_ids[10], ma_ids[11], ny_ids[12]]) x;
    insert into connections (requester_id, addressee_id, tier, status, created_at)
    values (p_nick, tx_ids[13], 'trusted_colleague', 'pending', now() - interval '2 days');
    insert into saved_clinicians (profile_id, clinician_id, note)
    select p_nick, x, null from unnest(array[tx_ids[15], tx_ids[18], ma_ids[20], ny_ids[21], tx_ids[22]]) x
    on conflict do nothing;

    -- worked with before
    insert into professional_events (event_type, actor_profile_id, actor_type, related_profile_id, summary, created_at)
    values ('coverage_completed', tx_ids[1], 'member_web', p_nick, 'Demo activity', now() - interval '60 days'),
           ('referral_outcome', tx_ids[4], 'member_web', p_nick, 'Demo activity', now() - interval '35 days'),
           ('consultation_response', ma_ids[2], 'member_web', p_nick, 'Demo activity', now() - interval '20 days'),
           ('referral_outcome', tx_ids[1], 'member_web', p_nick, 'Demo activity', now() - interval '120 days');

    -- invitations as notifications
    for a in select x from unnest(array[tx_ids[10], ma_ids[11], ny_ids[12]]) x loop
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('trusted_invitation_sent', a, 'member_web', 'invited you to their trusted circle', '/dashboard/network', '{"demo":true}') returning id into ev_id;
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());
    end loop;

    -- referrals offered to the real account
    for n in 1..3 loop
      a := (array[tx_ids[2], tx_ids[1], tx_ids[9]])[n];
      insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
        notes, status, audience_type, audience_profile_ids, created_at)
      values (a, (array[array[7, 57], array[61, 0], array[16, 35]])[n:n], (array[7, 61, 16])[n], 'TX', 'Austin',
        (array['AETNA Health, Inc.', 'Out of Pocket Pay', 'United Healthcare'])[n], (array['Adults', 'Young Adults', 'Adults'])[n],
        (array['either', 'virtual', 'in_person'])[n], (array['within_month', 'urgent', 'flexible'])[n],
        (array['Weekday evenings preferred. Happy to talk through fit first.', 'Needs someone soon; current clinician is relocating.', 'Prefers in-person, flexible on timing.'])[n],
        'sent', case when n = 2 then 'trusted' else 'selected' end, array[p_nick], now() - ((n * 1.5) || ' days')::interval)
      returning id into new_id;
      update referral_requests set specialism_lookup_ids = array(select x from unnest(specialism_lookup_ids) x where x <> 0) where id = new_id;
      insert into private.demo_rows values ('referral_requests', new_id);
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('referral_sent', a, 'member_web', 'sent you a referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());
    end loop;

    -- the real account's own referral, with replies
    insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, insurance, age_band, modality, timeframe,
      notes, status, audience_type, audience_profile_ids, created_at)
    values (p_nick, array[41], 41, 'TX', 'Austin', 'CIGNA HealthCare (PPO)', 'Adolescents', 'either', 'within_month',
      'Adolescent, needs ERP experience. Parent involvement expected.', 'sent', 'selected', array[tx_ids[3], tx_ids[6], tx_ids[11]], now() - interval '3 days')
    returning id into new_id;
    insert into private.demo_rows values ('referral_requests', new_id);
    insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
    values (new_id, tx_ids[3], 'interested', 'I have two openings for adolescents and do ERP weekly. Happy to take this.', now() - interval '2 days', now() - interval '2 days'),
           (new_id, tx_ids[6], 'interested', 'Could start in three weeks. In person in Round Rock or virtual.', now() - interval '1 day', now() - interval '1 day'),
           (new_id, tx_ids[11], 'unavailable', 'Full until January, sorry.', now() - interval '1 day', now() - interval '1 day');
    for a in select x from unnest(array[tx_ids[3], tx_ids[6]]) x loop
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('referral_response', a, 'member_web', 'responded "interested" to your referral request', '/dashboard/refer/' || new_id, '{"demo":true}') returning id into ev_id;
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());
    end loop;
    -- and an earlier one, closed
    insert into referral_requests (requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, age_band, modality, timeframe, status, audience_type, audience_profile_ids, created_at, closed_at)
    values (p_nick, array[27], 27, 'TX', 'Austin', 'Seniors', 'in_person', 'flexible', 'closed', 'selected', array[tx_ids[4]], now() - interval '40 days', now() - interval '33 days')
    returning id into new_id;
    insert into private.demo_rows values ('referral_requests', new_id);
    insert into referral_responses (referral_request_id, responding_profile_id, status, message, created_at, responded_at)
    values (new_id, tx_ids[4], 'accepted', 'Yes, I can see them from next week.', now() - interval '39 days', now() - interval '39 days');

    -- a colleague asking the real account for urgent cover
    insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
    values (tx_ids[7], 'Unexpected absence, this week', 'unexpected', 'TX', 'parallel', 'active', current_date, current_date + 10, 'ad_hoc', now() - interval '6 hours')
    returning id into plan_id;
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status)
    values (plan_id, 'Case 1', array[7], 'Adults', 'virtual', 'Out of Pocket Pay', 'Weekly', 'awaiting_response') returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, message, sent_at)
    values (case_id, p_nick, 1, 'sent', 'Could you hold two sessions while I''m out? Summary to follow once you agree.', now() - interval '6 hours');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_request', tx_ids[7], 'member_web', 'sent you a coverage request', '/dashboard/cover', '{"demo":true}') returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());

    -- the real account's own cover plan, part-way through
    insert into coverage_plans (profile_id, title, absence_type, jurisdiction_state, outreach_mode, status, starts_on, ends_on, plan_type, created_at)
    values (p_nick, 'Parental leave, November', 'extended_leave', 'TX', 'sequential', 'active', current_date + 40, current_date + 130, 'extended_leave', now() - interval '5 days')
    returning id into plan_id;
    insert into private.demo_rows values ('coverage_plans', plan_id);
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status, assigned_clinician_id)
    values (plan_id, 'Case 1', array[7, 57], 'Adults', 'either', 'AETNA Health, Inc.', 'Weekly', 'confirmed', tx_ids[1]) returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, sent_at, responded_at)
    values (case_id, tx_ids[1], 1, 'accepted', now() - interval '4 days', now() - interval '3 days');
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, status, outreach_queue)
    values (plan_id, 'Case 2', array[61], 'Young Adults', 'virtual', 'Out of Pocket Pay', 'Weekly', 'awaiting_response', array[tx_ids[16]]) returning id into case_id;
    insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, status, sent_at)
    values (case_id, tx_ids[4], 1, 'sent', now() - interval '1 day');
    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency, prescribing_needed, status)
    values (plan_id, 'Case 3', array[10], 'Adults', 'in_person', 'United Healthcare', 'Fortnightly', true, 'needs_cover');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('coverage_confirmed', tx_ids[1], 'member_web', 'confirmed they can cover your case', '/dashboard/cover/' || plan_id || '?step=track', '{"demo":true}') returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());

    -- the real account's question, answered
    insert into consultations (author_profile_id, question, context, consultation_type, audience_type, tags, status, deidentification_confirmed, kind, created_at)
    values (p_nick, 'How are you structuring the handover call when a covering colleague takes over mid-treatment?',
      'Planning an extended leave and want the transition to feel seamless for clients.', 'termination_transfer', 'trusted', array['Private practice'], 'responses_received', true, 'question', now() - interval '2 days')
    returning id into cons_id;
    insert into private.demo_rows values ('consultations', cons_id);
    insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, created_at)
    values (cons_id, tx_ids[1], 'reply', 'I do a 20-minute joint call with the colleague before leave starts, then a written summary. PA-02 has a good checklist.', now() - interval '1 day'),
           (cons_id, ma_ids[2], 'reply', 'Tell clients who to contact and when, in writing. The ambiguity is what unsettles people.', now() - interval '20 hours');
    for a in select x from unnest(array[tx_ids[1], ma_ids[2]]) x loop
      insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
      values ('consultation_response', a, 'member_web', 'replied to your consultation', '/dashboard/consult/' || cons_id, '{"demo":true}') returning id into ev_id;
      insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());
    end loop;
    insert into consult_tag_follows (profile_id, tag) values (p_nick, 'Trauma/PTSD'), (p_nick, 'Private practice') on conflict do nothing;

    -- consultation groups: one joined, one invitation
    insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
    values ('Austin Trauma Consultation Group', 'Monthly case consultation for clinicians working with trauma', tx_ids[1], 'Monthly', 'video',
      'Members only. Cases are always de-identified. This is consultation, not supervision: the treating clinician decides. No recording or transcription. Present cases using the PA-05 format.', 2)
    returning id into grp_id;
    insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
    values (grp_id, tx_ids[1], 'joined', 'creator', now()), (grp_id, p_nick, 'joined', 'member', now()),
           (grp_id, tx_ids[4], 'joined', 'member', now()), (grp_id, tx_ids[7], 'joined', 'member', now()), (grp_id, tx_ids[19], 'joined', 'member', now());
    insert into consultations (author_profile_id, question, context, consultation_type, audience_type, group_id, status, deidentification_confirmed, kind, created_at)
    values (tx_ids[4], 'Adult client with complex trauma dissociating in session: pacing EMDR preparation', 'Broad context only; happy to discuss at the next meeting.', 'treatment_impasse', 'selected', grp_id, 'responses_received', true, 'question', now() - interval '4 days')
    returning id into cons_id;
    insert into consultation_responses (consultation_id, responder_profile_id, body, created_at)
    values (cons_id, tx_ids[1], 'I''d extend resourcing and check window of tolerance each session before any processing.', now() - interval '3 days'),
           (cons_id, tx_ids[19], 'Grounding objects helped one of mine. Agree on slowing down.', now() - interval '2 days');
    insert into consultations (author_profile_id, question, audience_type, group_id, status, deidentification_confirmed, kind, created_at)
    values (tx_ids[7], 'Agenda for next month: vicarious trauma and caseload limits', 'selected', grp_id, 'open', true, 'question', now() - interval '1 day');

    insert into consultation_groups (name, purpose, created_by, cadence, meeting_format, charter_body, charter_version)
    values ('Boston Child & Adolescent Peer Group', 'Fortnightly peer consultation on child and adolescent cases', ma_ids[5], 'Every two weeks', 'hybrid',
      'Members only. De-identified cases. Consultation, not supervision. Parents and schools are discussed only in general terms.', 1)
    returning id into grp_id;
    insert into consultation_group_members (group_id, profile_id, status, role, responded_at)
    values (grp_id, ma_ids[5], 'joined', 'creator', now()), (grp_id, ma_ids[2], 'joined', 'member', now()), (grp_id, ny_ids[3], 'joined', 'member', now());
    insert into consultation_group_members (group_id, profile_id, status, role) values (grp_id, p_nick, 'invited', 'member');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('consultation_invite', ma_ids[5], 'member_web', 'invited you to join the Boston Child & Adolescent Peer Group', '/dashboard/consult/groups/' || grp_id, '{"demo":true}') returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());

    -- messages
    insert into conversations (created_by, title, created_at, last_message_at)
    values (tx_ids[3], 'Referral · Obsessive/Compulsive Disorder · Austin, TX', now() - interval '2 days', now() - interval '3 hours') returning id into conv_id;
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, tx_ids[3], now()), (conv_id, p_nick, now() - interval '1 day');
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, tx_ids[3], 'Thanks for thinking of me for this one. I have Tuesday and Thursday afternoons free.', now() - interval '2 days'),
           (conv_id, tx_ids[3], 'Also happy to do a quick call with the family first if that helps.', now() - interval '3 hours');
    insert into conversations (created_by, title, created_at, last_message_at)
    values (tx_ids[1], 'Cover · Parental leave, November', now() - interval '3 days', now() - interval '1 day') returning id into conv_id;
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, tx_ids[1], now()), (conv_id, p_nick, now() - interval '2 days');
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, tx_ids[1], 'Happy to take Case 1. Can we do the handover call the week before you go?', now() - interval '3 days'),
           (conv_id, p_nick, 'Perfect, thank you. I''ll send times.', now() - interval '2 days'),
           (conv_id, tx_ids[1], 'Great. I''ve blocked Thursday mornings for them from mid-November.', now() - interval '1 day');
    insert into conversations (created_by, title, created_at, last_message_at)
    values (ma_ids[2], 'Coffee at the APA meeting?', now() - interval '8 days', now() - interval '7 days') returning id into conv_id;
    insert into conversation_participants (conversation_id, profile_id, last_read_at) values (conv_id, ma_ids[2], now()), (conv_id, p_nick, now());
    insert into conversation_messages (conversation_id, author_id, body, created_at)
    values (conv_id, ma_ids[2], 'Are you going to the regional meeting next month? Would be good to meet in person.', now() - interval '8 days'),
           (conv_id, p_nick, 'Yes, I''ll be there Friday. Let''s find a slot.', now() - interval '7 days');
    insert into notification_events (event_type, actor_profile_id, actor_type, summary, deep_link, metadata)
    values ('message_received', tx_ids[3], 'member_web', 'sent you a message', '/dashboard/messages', '{"demo":true}') returning id into ev_id;
    insert into notification_deliveries (notification_event_id, recipient_profile_id, channel, status, delivered_at) values (ev_id, p_nick, 'in_app', 'sent', now());
  end if;

  return (select count(*) from profiles where is_demo)::text || ' demo members';
end;
$$;

revoke all on function private.seed_demo_network(uuid) from public, anon, authenticated;
revoke all on function private.purge_demo_network() from public, anon, authenticated;

select private.seed_demo_network('80f99ddc-39bd-4c82-9d7e-5965c3473613');
