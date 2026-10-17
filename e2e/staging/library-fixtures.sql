-- Fictional Practice Library entries for staging, so the public library
-- pages have something to show. Both stay provisional: staging never
-- presents a document as reviewed. Run after fixtures.mjs (needs the
-- operator account).
\set ON_ERROR_STOP on
insert into public.documents (profile_id, uploaded_by, owner_scope, title, storage_path, library_code, summary, category, audience, public_contents, review_status, public_listed, public_download, version)
select p.id, p.id, 'world', v.title, v.path, v.code, v.summary, v.category, 'Psychologists and psychiatrists in private practice', v.contents, 'provisional', true, false, 1
from public.profiles p
join auth.users u on u.id = p.id and u.email = 'otto@mail.staging.example'
cross join (values
  ('PA-01: Reciprocal Coverage Agreement', 'library/qa/pa-01.docx', 'PA-01', 'A staging stand-in: who covers whom, response times and a per-client summary.', 'Coverage', array['Agreement', 'Per-client summary']),
  ('PA-03: Professional Will', 'library/qa/pa-03.docx', 'PA-03', 'A staging stand-in: who steps in for your practice if you cannot.', 'Continuity', array['Will', 'Instructions for your executor'])
) as v(title, path, code, summary, category, contents)
on conflict do nothing;
