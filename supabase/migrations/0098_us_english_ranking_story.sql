-- 0098: US English in messages and demo text, recently confirmed colleagues
-- next in the directory, and a sandbox story that notices what the guest
-- has done. Applied to both projects. Functions are edited in place
-- (pg_get_functiondef + replace) because some are too large to resend.

-- 1. "licence" to "license" in user-facing text, and the remaining British
--    spellings and PSYPACT claims in demo copy.
do $do$
declare f text; def text; orig text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public','private') and p.proname in ('guard_connection_eligibility','guard_consultation_publish','guard_conversation_eligibility','guard_cover_outreach','guard_group_membership','guard_library_reviewer','guard_referral_response','guard_verification_evidence','queue_credential_reminders','sandbox_story_event','seed_demo_network','seed_demo_viewer')
  loop
    def := pg_get_functiondef(f::regprocedure); orig := def;
    def := regexp_replace(def, '(\s)([Ll])icence(s?)\M', '\1\2icense\3', 'g');
    def := replace(def, 'Fortnightly peer consultation on', 'Peer consultation every two weeks on');
    def := replace(def, 'Offering fortnightly supervision', 'Offering supervision every two weeks');
    def := replace(def, 'Trying to standardise mine', 'Trying to standardize mine');
    def := replace(def, 'Two adult enquiries', 'Two adult inquiries');
    def := replace(def, 'at the centre of my work', 'at the center of my work');
    def := replace(def, 'case conceptualisation', 'case conceptualization');
    def := replace(def, 'PSYPACT covers me for now; curious', 'I''''m not licensed in Vermont, and New York isn''''t a PSYPACT state, so I can''''t follow them there; curious');
    def := replace(def, 'PSYPACT telehealth across member states for selected referrals.', 'In person and by telehealth across New York, for selected referrals.');
    if def <> orig then execute def; end if;
  end loop;
end
$do$;

-- 2. Directory: after your circle and fresh "accepting" colleagues, anyone
--    with a current confirmation, most recent first, then the rest.
do $do$
declare def text := pg_get_functiondef('public.network_directory'::regproc);
begin
  if strpos(def, 'f.confirmed_at desc nulls last') > 0 then return; end if;
  if strpos(def, 'f.fresh desc, f.full_name) ord') = 0 then raise exception 'order clause not found'; end if;
  execute replace(def, 'f.fresh desc, f.full_name) ord', 'f.fresh desc, (f.confirmed_at is not null and (f.paused_until is null or f.paused_until < current_date)) desc, f.confirmed_at desc nulls last, f.full_name) ord');
end
$do$;

-- 3. Maya's first message depends on whether the guest has already planned
--    leave or sent her a cover request.
do $do$
declare def text := pg_get_functiondef('private.sandbox_story_event'::regproc);
begin
  if strpos(def, 'Got your cover request') > 0 then return; end if;
  def := replace(def, '''Congratulations again on your news! When you plan your leave, I have two cover slots free. Send the plan my way.''',
    '(case when exists (select 1 from coverage_requests cr join coverage_plan_cases pc on pc.id = cr.coverage_plan_case_id join coverage_plans cp on cp.id = pc.coverage_plan_id where cp.profile_id = p_viewer and cr.requested_profile_id = maya) then ''Got your cover request, thank you. I''''m going through the clients now and will reply on each one today.'' when exists (select 1 from coverage_plans cp where cp.profile_id = p_viewer) then ''Saw you''''ve started planning your leave. I have two cover slots free; add me to the plan if it helps.'' else ''Congratulations again on your news! When you plan your leave, I have two cover slots free. Send the plan my way.'' end)');
  def := replace(def, '''She has cover slots free for your leave.''', '''About your leave and her cover slots.''');
  execute def;
end
$do$;

-- 4. Demo rows already seeded (demo project only; needs approval in the
--    MCP because it updates data):
-- update consultations set context = replace(replace(replace(context, 'standardise', 'standardize'), 'enquiries', 'inquiries'), 'fortnightly', 'every two weeks') ...
