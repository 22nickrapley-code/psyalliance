-- "Case" becomes "client" wherever it means a person needing care (6 Oct 2026).
-- 1. The demo seed writes "Client 1" etc. (rewritten in place so the rest of
--    the function is untouched; applied to both projects for parity).
-- 2. Existing labels and demo text are updated to match.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.seed_demo_viewer'::regproc);
  d := replace(d, '''Case 1''', '''Client 1''');
  d := replace(d, '''Case 2''', '''Client 2''');
  d := replace(d, '''Case 3''', '''Client 3''');
  d := replace(d, 'confirmed they can cover your case', 'confirmed they can cover your client');
  d := replace(d, 'Cases are always de-identified.', 'Client details are always de-identified.');
  d := replace(d, 'Present cases using the PA-05 format.', 'Present clients using the PA-05 format.');
  d := replace(d, 'child and adolescent cases', 'child and adolescent clients');
  d := replace(d, 'Members only. De-identified cases.', 'Members only. Client details de-identified.');
  d := replace(d, 'Happy to take Cases 1 and 2.', 'Happy to take Clients 1 and 2.');
  d := replace(d, 'Prescribing for Case 3', 'Prescribing for Client 3');
  d := replace(d, 'If Case 3 needs', 'If Client 3 needs');
  execute d;
end $$;

update public.coverage_plan_cases set case_reference = regexp_replace(case_reference, '^Case\s*(\d+)$', 'Client \1')
  where case_reference ~ '^Case\s*\d+$';
update public.conversations set title = regexp_replace(title, '\mCase (\d+)', 'Client \1', 'g')
  where title ~ '\mCase \d+';
update public.conversation_messages set body = replace(replace(body, 'Happy to take Cases 1 and 2.', 'Happy to take Clients 1 and 2.'), 'If Case 3 needs', 'If Client 3 needs')
  where body like '%Cases 1 and 2%' or body like '%If Case 3 needs%';
update public.professional_events set summary = 'confirmed they can cover your client'
  where summary = 'confirmed they can cover your case';
update public.consultation_groups set charter_body = replace(replace(replace(charter_body,
    'Cases are always de-identified.', 'Client details are always de-identified.'),
    'Present cases using the PA-05 format.', 'Present clients using the PA-05 format.'),
    'Members only. De-identified cases.', 'Members only. Client details de-identified.')
  where charter_body like '%ases%';
