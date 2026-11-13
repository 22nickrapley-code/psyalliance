-- v10 (Nick, 12 Nov): a cover plan holds up to 30 clients (was 20). cover_create_plan is otherwise unchanged from 0130_v4_final.sql.
-- Safe to run more than once. Rollback: run the cover_create_plan definition from 0130_v4_final.sql again.
CREATE OR REPLACE FUNCTION public.cover_create_plan(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  req_id uuid;
  plan_id bigint;
  nm text;
  reason text;
  mode text;
  hrs integer;
  d_start date;
  d_end date;
  msg text;
  clients jsonb;
  cl jsonb;
  ord integer;
  lbl text;
  st text;
  setting text;
  focus_name text;
  sec_name text;
  focus_id integer;
  sec_id integer;
  age_v text;
  ins_v text;
  lang_v text;
  v_city text;
  case_id bigint;
  pid uuid;
  sel uuid[];
  kept uuid[];
  excl text[];
  dropped jsonb := '[]'::jsonb;
  asked_per jsonb := '{}'::jsonb;
  first_req bigint;
  rid bigint;
  seq integer;
  states_seen text[] := '{}';
  n_asked integer := 0;
  k text;
  cnt integer;
  abs_type text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can ask colleagues for cover.' using errcode = 'P0001';
  end if;
  req_id := nullif(p_payload ->> 'requestId', '')::uuid;
  if req_id is not null then
    perform pg_advisory_xact_lock(hashtext('cover_create:' || me::text || req_id::text));
    select id into plan_id from coverage_plans where profile_id = me and client_request_id = req_id;
    if found then
      return jsonb_build_object('planId', plan_id, 'unchanged', true, 'dropped', '[]'::jsonb);
    end if;
  end if;

  nm := btrim(coalesce(p_payload ->> 'name', ''));
  if nm = '' or length(nm) > 80 then
    raise exception 'Give the plan a short name.' using errcode = 'P0001';
  end if;
  reason := coalesce(nullif(p_payload ->> 'reason', ''), 'short');
  if reason not in ('short', 'extended', 'unexpected', 'closing', 'reciprocal', 'other') then
    raise exception 'Choose the kind of cover you need.' using errcode = 'P0001';
  end if;
  mode := coalesce(nullif(p_payload ->> 'mode', ''), 'sequential');
  if mode not in ('sequential', 'parallel') then
    raise exception 'Choose how colleagues are asked.' using errcode = 'P0001';
  end if;
  hrs := coalesce(nullif(p_payload ->> 'deadline', '')::integer, 48);
  if hrs not in (6, 12, 24, 48, 72, 168) then
    raise exception 'Choose a response deadline from the list.' using errcode = 'P0001';
  end if;
  d_start := nullif(p_payload ->> 'start', '')::date;
  d_end := nullif(p_payload ->> 'end', '')::date;
  -- Closing or reducing practice, and reciprocal cover, can run "until further notice" (Nick, 6 Nov): no last day.
  -- It is still temporary cover; the member ends it with "End this cover" when it stops.
  if d_start is null or (d_end is null and reason not in ('closing', 'reciprocal')) then
    raise exception 'Choose the first and last day.' using errcode = 'P0001';
  end if;
  if d_end is not null and d_end < d_start then
    raise exception 'The last day is before the first day.' using errcode = 'P0001';
  end if;
  msg := btrim(coalesce(p_payload ->> 'message', ''));
  if length(msg) > 1000 then
    raise exception 'Keep the message under 1,000 characters.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_payload ->> 'other', '')) > 300 then
    raise exception 'Keep the note under 300 characters.' using errcode = 'P0001';
  end if;
  clients := coalesce(p_payload -> 'clients', '[]'::jsonb);
  if jsonb_typeof(clients) <> 'array' or jsonb_array_length(clients) = 0 then
    raise exception 'Add at least one client need.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(clients) > 30 then
    raise exception 'A plan can hold up to 30 client needs.' using errcode = 'P0001';
  end if;

  abs_type := case reason when 'short' then 'short_planned' when 'extended' then 'extended_leave' when 'closing' then 'closing_practice' else reason end;
  insert into coverage_plans (profile_id, plan_type, track, title, starts_on, ends_on, status, notes, absence_type, jurisdiction_state,
                              outreach_mode, reason, reason_note, response_hours, client_request_id)
  values (me,
          (case reason when 'reciprocal' then 'reciprocal' when 'extended' then 'extended_leave' else 'ad_hoc' end)::coverage_plan_type,
          null::coverage_plan_track,
          nm, d_start, d_end, 'active', nullif(msg, ''), abs_type,
          upper(nullif(clients -> 0 ->> 'state', '')), mode, reason, nullif(btrim(coalesce(p_payload ->> 'other', '')), ''), hrs, req_id)
  returning id into plan_id;

  perform set_config('pa.cover_quiet', 'on', true);
  ord := 0;
  for cl in select * from jsonb_array_elements(clients) loop
    ord := ord + 1;
    lbl := btrim(coalesce(cl ->> 'label', ''));
    if lbl = '' then lbl := 'Client ' || ord; end if;
    if length(lbl) > 40 then
      raise exception 'Keep each client label short.' using errcode = 'P0001';
    end if;
    st := upper(coalesce(cl ->> 'state', ''));
    if st !~ '^[A-Z]{2}$' then
      raise exception '% needs a state.', lbl using errcode = 'P0001';
    end if;
    setting := coalesce(nullif(cl ->> 'setting', ''), 'either');
    if setting not in ('virtual', 'in_person', 'either') then
      raise exception 'Choose a setting for %.', lbl using errcode = 'P0001';
    end if;
    focus_name := btrim(coalesce(cl ->> 'focus', ''));
    select id into focus_id from lookup_values where category = 'treatment_specialism' and value = focus_name;
    if focus_id is null then
      raise exception 'Choose a main treatment area for %.', lbl using errcode = 'P0001';
    end if;
    sec_name := btrim(coalesce(cl ->> 'secondary', ''));
    sec_id := null;
    if sec_name <> '' then
      select id into sec_id from lookup_values where category = 'treatment_specialism' and value = sec_name;
      if sec_id is null or sec_name = focus_name then
        raise exception 'Choose a different second treatment area for %.', lbl using errcode = 'P0001';
      end if;
    end if;
    age_v := nullif(btrim(coalesce(cl ->> 'age', '')), '');
    if age_v is not null and not exists (select 1 from lookup_values where category = 'age_group_specialism' and value = age_v) then
      raise exception 'Choose an age group from the list for %.', lbl using errcode = 'P0001';
    end if;
    ins_v := nullif(btrim(coalesce(cl ->> 'insurance', '')), '');
    if ins_v is not null and not exists (select 1 from lookup_values where category = 'insurance' and value = ins_v) then
      raise exception 'Choose insurance from the list for %.', lbl using errcode = 'P0001';
    end if;
    lang_v := nullif(btrim(coalesce(cl ->> 'language', '')), '');
    if lang_v is not null and not exists (select 1 from lookup_values where category = 'language' and value = lang_v) then
      raise exception 'Choose a language from the list for %.', lbl using errcode = 'P0001';
    end if;
    v_city := nullif(btrim(coalesce(cl ->> 'city', '')), '');
    if length(coalesce(v_city, '')) > 80 or length(coalesce(cl ->> 'frequency', '')) > 40 then
      raise exception 'Shorten the details for %.', lbl using errcode = 'P0001';
    end if;

    insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, age_band, modality, insurance, frequency,
                                     prescribing_needed, jurisdiction_state, language, city, status, via_hub)
    values (plan_id, lbl, array_remove(array[focus_id, sec_id], null), age_v, setting, ins_v, nullif(btrim(coalesce(cl ->> 'frequency', '')), ''),
            coalesce((cl ->> 'prescribing')::boolean, false), st, lang_v, v_city, 'needs_cover', true)
    returning id into case_id;
    if not (st = any (states_seen)) then states_seen := states_seen || st; end if;

    -- Recipients: distinct, never the organiser, at most ten, in the order chosen.
    select coalesce(array_agg(x.id order by x.o), '{}') into sel
      from (select (e.value)::uuid as id, min(e.ordinality) as o
              from jsonb_array_elements_text(coalesce(cl -> 'selected', '[]'::jsonb)) with ordinality e(value, ordinality)
             where (e.value)::uuid <> me
             group by (e.value)::uuid) x;
    if array_length(sel, 1) > 10 then
      raise exception 'Ask up to ten colleagues about one client.' using errcode = 'P0001';
    end if;
    kept := '{}';
    foreach pid in array sel loop
      excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = pid)
                   then private.cover_case_exclusions(case_id, pid)
                   else array['Not a colleague you can ask'] end;
      if array_length(excl, 1) is null then
        kept := kept || pid;
      else
        dropped := dropped || jsonb_build_object('client', lbl, 'person', pid, 'reasons', to_jsonb(excl));
        if exists (select 1 from profiles where id = pid) then
          perform private.cover_event(plan_id, case_id, pid, 'skipped', jsonb_build_object('reasons', to_jsonb(excl)));
        end if;
      end if;
    end loop;

    if array_length(kept, 1) is not null then
      seq := 0;
      foreach pid in array kept loop
        seq := seq + 1;
        exit when mode = 'sequential' and seq > 1;
        insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order, message)
        values (case_id, pid, seq, nullif(msg, ''))
        returning id into rid;
        n_asked := n_asked + 1;
        asked_per := jsonb_set(asked_per, array[pid::text], to_jsonb(coalesce((asked_per ->> pid::text)::integer, 0) + 1));
        if first_req is null then first_req := rid; end if;
        perform private.professional_event('coverage_request_sent', me, pid, 'sent a coverage request',
                                           jsonb_build_object('coveragePlanCaseId', case_id, 'coverageRequestId', rid));
      end loop;
      update coverage_plan_cases
         set status = 'awaiting_response',
             outreach_queue = case when mode = 'sequential' then kept[2:array_length(kept, 1)] else '{}'::uuid[] end
       where id = case_id;
    end if;
  end loop;
  perform set_config('pa.cover_quiet', 'off', true);

  update coverage_plans set jurisdiction_state = states_seen[1] where id = plan_id;
  perform private.cover_event(plan_id, null, null, 'created', jsonb_build_object('clients', jsonb_array_length(clients)));
  perform private.cover_event(plan_id, null, null, 'invited', jsonb_build_object('mode', mode, 'hours', hrs));
  for k, cnt in select key, value::integer from jsonb_each_text(asked_per) loop
    perform private.cover_event(plan_id, null, k::uuid, 'asked_you', jsonb_build_object('n', cnt));
    perform private.notify_member('coverage_request', k::uuid, me, 'sent you a coverage request',
                                  '/dashboard/cover?plan=' || plan_id, 'coverage_plan:' || plan_id || ':' || k,
                                  jsonb_build_object('coveragePlanId', plan_id));
  end loop;
  return jsonb_build_object('planId', plan_id, 'unchanged', false, 'dropped', dropped, 'asked', n_asked);
end;
$function$;


-- v10 (Nick, 12 Nov): the sandbox's discussions are the dilemmas a clinician on their own actually faces, with replies worth reading.
-- Same people, audiences and timings as 0119; new sandboxes pick them up. Rollback: re-run demo_discussions() from 0119_v13_sandbox.sql.
create or replace function private.demo_discussions()
returns jsonb language sql immutable as $fn$ select $j$[{"n": 1, "author": "maya", "title": "Burnout or depression? Where do you draw the line in high-functioning adults?", "body": "A senior professional, still performing well at work and flat everywhere else. I keep moving between a burnout frame and a depression one, and it changes what I recommend. How do you decide?", "topic": "Clinical practice", "aud": "trusted", "hours": 0.4, "replies": [{"p": "rena", "t": "I look at what rest restores. If weekends and holidays bring nothing back, I treat it as depression first and revisit burnout once mood lifts.", "h": 1}, {"p": "maya", "t": "Useful test. Here, a holiday helps for about three days, then it is all back.", "h": 2}, {"p": "sophie", "t": "Three days of relief points me to burnout with a depressive edge. I would also take a careful sleep history; changes in sleep timing often show first.", "h": 3}, {"p": "imani", "t": "I give a PHQ-9 and a burnout measure side by side at intake and again at six weeks. The trend between the two has helped me explain the plan to the client, too.", "h": 4}]}, {"n": 2, "author": "alex", "title": "How do you keep notes from spilling into your evenings?", "body": "Since going solo my notes run into the evening two or three nights a week. What has actually worked for you: blocked time, shorter templates, or ending sessions earlier?", "topic": "Professional life", "aud": "network", "hours": 1, "replies": [{"p": "maya", "t": "Fifty-minute sessions, with the last ten for the note, written before the next client. It felt rigid for a month; I would not go back.", "h": 1}, {"p": "sophie", "t": "One short template per modality. Most of my notes are three sentences now and still meet my payers' standard.", "h": 2}, {"p": "imani", "t": "I stopped offering a 6 pm slot. It cost one client a week and gave me back three evenings.", "h": 3}, {"p": "alex", "t": "The ten-minute rule is the one I keep breaking. Sophie, would you share how your template is laid out?", "h": 4}, {"p": "james", "t": "The documentation templates in the PsyAlliance Library are a quick start. I adapted them to my EHR in an afternoon.", "h": 5}]}, {"n": 3, "author": "sophie", "title": "Do you keep a waitlist, and how do you keep it honest?", "body": "My waitlist is fourteen names long and realistically most will wait months. Do you keep one at all, or refer out straight away? How do you word it to the person asking?", "topic": "Clinical practice", "aud": "group", "hours": 2, "replies": [{"p": "imani", "t": "I stopped keeping one. I say I cannot see them soon and offer two colleagues who have room. People are grateful for the honesty.", "h": 1}, {"p": "alex", "t": "I keep a short list of five and tell each person the honest wait, then check in monthly. Past five it stopped being fair.", "h": 2}, {"p": "sophie", "t": "Offering two named colleagues is the part I have been missing. I never know who actually has room.", "h": 3}, {"p": "james", "t": "That is exactly what a referral here solves: the colleagues offered have confirmed they have room, and they reply within the time you set.", "h": 4}, {"p": "eli", "t": "For anyone needing medication as well, I am glad to be one of the two names in New York.", "h": 5}, {"p": "elena", "t": "Same for adolescents in Massachusetts. I have three openings this month.", "h": 6}]}, {"n": 4, "author": "rena", "title": "Who covers for you if you are suddenly unwell?", "body": "I had flu last month and realised nobody could reach my clients, cancel sessions or see my calendar. If you work alone, what have you actually put in place?", "topic": "Professional life", "aud": "network", "hours": 3, "replies": [{"p": "imani", "t": "A named colleague with sealed instructions: how to reach my clients, where the schedule is, and what to say. We review it every year.", "h": 1}, {"p": "alex", "t": "My professional will lives with my attorney, and the practical half lives with a colleague. The Library template took most of the guesswork out.", "h": 2}, {"p": "james", "t": "The continuity plan in your profile does the same thing. My backup agreed in a day.", "h": 3}, {"p": "eli", "t": "Worth agreeing reciprocal cover with one or two people too, so a short illness never needs a scramble.", "h": 4}]}, {"n": 5, "author": "elena", "title": "A 16-year-old wants confidentiality from parents who are paying. How do you set it up?", "body": "Parents are paying and want regular updates. The teen will only engage if what they say stays private. How do you agree it with everyone at the start, before it becomes a problem?", "topic": "Clinical practice", "aud": "group", "hours": 4, "replies": [{"p": "alex", "t": "I meet the parents and teen together first and agree in writing what I will share: safety, attendance and broad themes, never content.", "h": 1}, {"p": "james", "t": "Check your state's minor-consent rules first. In some states the teen holds the privilege for therapy, whatever the parents pay.", "h": 2}, {"p": "eli", "t": "I add a line on what happens if risk changes, and say it out loud in the first session so nobody is surprised later.", "h": 3}, {"p": "elena", "t": "Writing it down with all three of them is what I was missing. I will do that this week.", "h": 4}, {"p": "lena", "t": "The informed consent template in the Library is a sound base; add a short section for minors and the parents' role.", "h": 5}]}, {"n": 6, "author": "james", "title": "What makes a peer consultation group worth the hour?", "body": "I have joined two groups that faded within months. If yours has lasted, what keeps it useful: size, structure, presenting order, a charter?", "topic": "Consultation", "aud": "network", "hours": 26, "replies": [{"p": "eli", "t": "Six people, fortnightly, a fixed presenting rota. We stopped when we tried to be flexible.", "h": 1}, {"p": "elena", "t": "A one-page charter: confidentiality, de-identification, and that we end on time. It sounds dull and it saved us.", "h": 2}, {"p": "lena", "t": "One case per meeting, with a question, not a story. 'What would you do next?' changes the whole conversation.", "h": 3}, {"p": "fatima", "t": "We rotate a chair who keeps time. Nobody wants to be the person who runs over.", "h": 4}, {"p": "marcus", "t": "The Library has a charter template. We used it as a starting point and argued about two lines.", "h": 5}, {"p": "james", "t": "Fixed rota and one question per case. I will bring both to my next group.", "h": 6}]}, {"n": 7, "author": "maya", "title": "Your fee went up this year. How did you tell existing clients?", "body": "I have not raised my fee in three years and I need to. I worry about long-term clients who are on a tight budget. How much notice did you give, and did you keep anyone on the old rate?", "topic": "Professional life", "aud": "group", "hours": 26, "replies": [{"p": "eli", "t": "Sixty days' notice in writing, then raised in session. Nobody left.", "h": 1}, {"p": "elena", "t": "I kept two clients on the old rate, by my choice, and told them it was a choice, not a policy.", "h": 2}, {"p": "lena", "t": "A sliding-scale slot or two for existing clients made it easier to say the new number out loud.", "h": 3}, {"p": "fatima", "t": "Remember to update your Good Faith Estimate for self-pay clients. The fee policy template in the Library covers it.", "h": 4}]}, {"n": 8, "author": "alex", "title": "What has helped with the isolation of working alone?", "body": "I love the independence of private practice and miss having colleagues down the corridor. What has actually helped, beyond a consultation group?", "topic": "Community", "aud": "network", "hours": 26, "replies": [{"p": "elena", "t": "A standing coffee with two local colleagues once a month. We swap referrals as much as stories.", "h": 1}, {"p": "lena", "t": "Asking questions here. A hard case on a Thursday no longer waits until a monthly group.", "h": 2}, {"p": "fatima", "t": "Covering for one another. Knowing who has my clients if I am away changed how alone it feels.", "h": 3}, {"p": "marcus", "t": "Saying yes to supervising one early-career clinician. It gave my week a different shape.", "h": 4}, {"p": "nora", "t": "Agreeing with two trusted colleagues that we can call each other about a risk decision, same day.", "h": 5}]}, {"n": 9, "author": "sophie", "title": "Telehealth across state lines: what do you check before the first session?", "body": "A client is spending the winter in Florida and wants to keep working by video. I am licensed in Massachusetts only. What do you check, and in what order?", "topic": "Resources", "aud": "group", "hours": 50, "replies": [{"p": "lena", "t": "Where the client is physically located during the session is what counts. If you are not licensed or under PSYPACT there, you cannot see them.", "h": 1}, {"p": "fatima", "t": "Check whether both states are PSYPACT members and whether you hold the authority to practice under it.", "h": 2}, {"p": "marcus", "t": "If not, a temporary practice allowance sometimes exists. Florida's rules are specific; read them, do not assume.", "h": 3}, {"p": "nora", "t": "Record the client's location at the start of every session. It is the first thing a board asks for.", "h": 4}, {"p": "talia", "t": "The telehealth template in the Library walks through these checks in this order.", "h": 5}, {"p": "daniel", "t": "If none of it works, a warm referral to a Florida colleague for the winter keeps the client safe and the door open.", "h": 6}]}]$j$::jsonb; $fn$;
revoke all on function private.demo_discussions() from public, anon, authenticated;
