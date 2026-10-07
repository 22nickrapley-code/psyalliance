-- 0100: the Practice Library as a public front door. Listed documents get
-- public pages; a document can be downloaded by anyone only once it has
-- been independently reviewed and published and Nick has turned the
-- download on. Leads are recorded for manual follow-up (no email yet).
-- Applied to both projects. The anon functions here are intentional.

alter table public.documents add column if not exists public_listed boolean not null default false;
alter table public.documents add column if not exists public_download boolean not null default false;
alter table public.documents add column if not exists public_contents text[];

-- Never downloadable while provisional; dropping back clears it.
create or replace function private.documents_public_download_guard()
 returns trigger
 language plpgsql
as $function$
begin
  if new.public_download and not (new.review_status = 'published' and new.review_date is not null) then
    if tg_op = 'UPDATE' and old.public_download and (new.review_status is distinct from old.review_status or new.review_date is distinct from old.review_date) then
      new.public_download := false;
    else
      raise exception 'A document can be downloaded publicly only once it has been reviewed and published.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

create trigger documents_public_download_guard
  before insert or update of public_download, review_status, review_date on public.documents
  for each row execute function private.documents_public_download_guard();

create table if not exists public.library_leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  library_code text not null,
  full_name text not null,
  email text not null,
  role text not null,
  state text,
  intent text not null check (intent in ('download', 'notify')),
  source text
);
create index if not exists library_leads_created_idx on public.library_leads (created_at desc);
alter table public.library_leads enable row level security;

alter table public.join_requests add column if not exists source text;

-- Listed documents for the public pages. Never storage paths.
create or replace function public.public_library()
 returns table(code text, title text, summary text, category text, audience text, contents text[], reviewed boolean,
   review_date date, reviewers text[], downloadable boolean, version integer)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select d.library_code, regexp_replace(d.title, '^PA-\d+:\s*', ''), coalesce(d.summary, d.applicability, ''), coalesce(d.category, 'Practice'),
    coalesce(d.audience, ''), coalesce(d.public_contents, '{}'),
    (d.review_status = 'published' and d.review_date is not null), d.review_date,
    case when d.review_status = 'published' and d.review_date is not null then
      (select array_agg(distinct p.full_name || coalesce(', ' || p.qualification_level::text, ''))
       from document_reviews r join profiles p on p.id = r.reviewer_profile_id
       where r.document_id = d.id and r.approved and r.invalidated_at is null)
    end,
    d.public_download and d.review_status = 'published' and d.review_date is not null,
    d.version
  from documents d
  where d.public_listed and d.library_code is not null and d.owner_scope = 'world'
    and d.review_status in ('published', 'provisional')
  order by d.library_code;
$function$;

-- Records a download or "tell me when it's free" request. Returns the file
-- path only when the document is published and its download is on.
create or replace function public.request_library_download(p_code text, p_full_name text, p_email text, p_role text, p_state text, p_intent text, p_source text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  em text := lower(trim(coalesce(p_email, '')));
  doc record;
begin
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please give your name.' using errcode = 'P0001';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please give a valid email address.' using errcode = 'P0001';
  end if;
  if coalesce(p_role, '') not in ('Psychologist', 'Psychiatrist', 'Other clinician', 'Other') then
    raise exception 'Please choose your role.' using errcode = 'P0001';
  end if;
  if coalesce(p_intent, '') not in ('download', 'notify') then
    raise exception 'Something went wrong. Please try again.' using errcode = 'P0001';
  end if;
  select * into doc from documents
  where library_code = upper(trim(p_code)) and public_listed and owner_scope = 'world' and review_status in ('published', 'provisional');
  if doc.id is null then
    raise exception 'We couldn''t find that template.' using errcode = 'P0001';
  end if;
  if (select count(*) from library_leads where created_at > now() - interval '1 hour') > 200 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from library_leads where lower(email) = em and library_code = doc.library_code and intent = p_intent and created_at > now() - interval '1 day') then
    insert into library_leads (library_code, full_name, email, role, state, intent, source)
    values (doc.library_code, left(trim(p_full_name), 120), em, p_role, nullif(upper(left(trim(coalesce(p_state, '')), 2)), ''), p_intent, nullif(left(trim(coalesce(p_source, '')), 80), ''));
  end if;
  if p_intent = 'download' and doc.public_download and doc.review_status = 'published' and doc.review_date is not null then
    return doc.storage_path;
  end if;
  return null;
end;
$function$;

-- The join request, with where it came from (a library page, say).
create or replace function public.request_to_join_from(p_full_name text, p_email text, p_qualification text, p_states text, p_note text, p_source text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare em text := lower(trim(coalesce(p_email, '')));
begin
  perform public.request_to_join(p_full_name, p_email, p_qualification, p_states, p_note);
  if nullif(trim(coalesce(p_source, '')), '') is not null then
    update join_requests set source = left(trim(p_source), 80)
    where id = (select id from join_requests where lower(email) = em order by created_at desc limit 1) and source is null;
  end if;
  return true;
end;
$function$;

-- Admin: leads newest first, and join requests that started in the Library.
create or replace function public.admin_library_leads()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'leads', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select * from library_leads order by created_at desc limit 2000) l), '[]'::jsonb),
    'joins', coalesce((select jsonb_object_agg(src, n) from (select source src, count(*) n from join_requests where source like 'library-%' group by source) j), '{}'::jsonb));
end;
$function$;

-- Anyone may fetch a library file once its download is on; the server
-- creates a short-lived signed link after a lead is recorded.
create or replace function public.library_file_is_public(p_name text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from documents d where d.storage_path = p_name and d.public_download
                 and d.review_status = 'published' and d.review_date is not null);
$function$;

-- Admin: the public settings for one template. The download guard trigger
-- still refuses a download until the document is published.
create or replace function public.admin_set_library_public(p_document bigint, p_listed boolean, p_download boolean, p_contents text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  update documents set
    public_listed = coalesce(p_listed, public_listed),
    public_download = coalesce(p_download, public_download) and coalesce(p_listed, public_listed),
    public_contents = coalesce(
      (select array_agg(left(trim(x), 160)) from unnest(p_contents) x where trim(x) <> ''),
      case when p_contents is null then public_contents else '{}' end)
  where id = p_document and owner_scope = 'world' and library_code is not null;
  if not found then
    raise exception 'We couldn''t find that template.' using errcode = 'P0001';
  end if;
end;
$function$;

-- Maya's first sandbox message points to the Extended Leave Pack when the guest hasn't
-- started a plan yet.
do $$ declare d text; begin
  select pg_get_functiondef('private.sandbox_story_event'::regproc) into d;
  if position('Send the plan my way.''' in d) > 0 then
    execute replace(d, 'Send the plan my way.''', 'Send the plan my way. I used the Extended Leave Pack in the Practice Library for mine last year; worth a look.''');
  end if;
end $$;

-- Templates are named, not numbered, wherever people read them.
do $$ declare d text; begin
  select pg_get_functiondef('private.demo_autorespond'::regproc) into d;
  if position('PA-05 is a good way' in d) > 0 then
    execute replace(d, 'PA-05 is a good way', 'The Case Consultation Template is a good way');
  end if;
  select pg_get_functiondef('private.seed_demo_viewer'::regproc) into d;
  if position('using the PA-05 format' in d) > 0 then
    execute replace(d, 'using the PA-05 format', 'using the Case Consultation Template');
  end if;
end $$;

create policy "published library files are downloadable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'shared' and public.library_file_is_public(name));

-- All 20 listed; downloads stay off until reviewed. "What's inside" drafts
-- for Nick to check in Admin.
update public.documents set public_listed = true where library_code is not null and owner_scope = 'world';
update public.documents d set public_contents = v.items from (values
  ('PA-01', array['Reciprocal coverage agreement for two clinicians', 'Per-client coverage summary', 'What the covering clinician may and may not do', 'Post-coverage debrief']),
  ('PA-02', array['Step-by-step plan for leave of more than two weeks', 'Client notification letter templates', 'Clinical handoff summary for each client', 'Return-to-practice checklist']),
  ('PA-03', array['Professional will template', 'Practice continuity inventory', 'Professional executor acceptance', 'Informed-consent language about your continuity plan']),
  ('PA-04', array['Group charter', 'Member agreement', '90-minute meeting agenda', 'Consultation log', 'Quarterly health check']),
  ('PA-05', array['De-identified case presentation form', 'De-identification checklist', 'Ethics decision steps', 'Consultation response sheet']),
  ('PA-06', array['Supervision agreement', 'Session log', 'Competency-based quarterly evaluation', 'For licensure, postdoctoral or consultative supervision']),
  ('PA-07', array['Referral, acceptance and decline letters', 'Close-the-loop letter', 'Six termination letter templates', 'Discharge summary', 'Records-request templates']),
  ('PA-08', array['Prescriber and therapist collaboration agreement', 'Client acknowledgment', 'Communication log for shared treatment']),
  ('PA-09', array['Adult psychotherapy informed consent', 'Optional modules: couples and family, minors, assessment, group', 'Customization checklist']),
  ('PA-10', array['Telehealth consent addendum', 'Client location verification', 'Pre-session checklist', 'Multi-state licensure and PSYPACT decision flow']),
  ('PA-11', array['Client consent for AI documentation tools', 'Vendor due-diligence checklist', 'Practice AI policy', 'Attestation for AI-drafted notes']),
  ('PA-12', array['Biopsychosocial intake', 'Mental status exam', 'SMART treatment plan', 'SOAP, DAP and BIRP progress notes with examples', 'Note-quality checklist']),
  ('PA-13', array['Risk formulation form', 'Six-step safety plan for clients', 'Lethal means counseling guide', 'Follow-up protocol', 'Duty-to-protect state worksheet']),
  ('PA-14', array['DEA telemedicine status and contingency plan', 'Prescribing checklist', 'Documentation elements', 'Controlled-substance treatment agreement', 'Client notice letter']),
  ('PA-15', array['Client financial policy', 'Good Faith Estimate template with timing rules', 'Superbill template with common codes', 'Fee-setting worksheet']),
  ('PA-16', array['Group practice model comparison', 'Worker classification warning', 'Term sheet and clause guide', 'Onboarding checklist', 'Joint client notice when a clinician leaves']),
  ('PA-17', array['Model Notice of Privacy Practices and acknowledgment', 'Authorization forms, general and psychotherapy notes', 'Records-request response letters', 'Who-is-asking guide']),
  ('PA-18', array['Security risk analysis worksheet with example', 'Safeguards checklist', 'Business associate checklist', 'Breach decision and notification guide', 'Incident log']),
  ('PA-19', array['Master renewal tracker', 'Annual compliance calendar', 'Quarterly review agenda', 'Record retention and destruction log']),
  ('PA-20', array['Decision table for subpoenas and legal requests', 'First-hour steps', 'Intake log', 'Letters to the attorney and the client', 'Licensing board complaint checklist'])
) as v(code, items)
where d.library_code = v.code and d.public_contents is null;
