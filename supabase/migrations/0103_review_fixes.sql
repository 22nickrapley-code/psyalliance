-- 0103: fixes from the 8 October product review. Applied to both projects.

-- 1. Referral replies come only from the people who received the referral.
-- A colleague can reply only to a referral they can see (its chosen
-- audience), and the sandbox's simulated replies follow the same rule.
do $$ begin
  execute $p$alter policy "respond to open requests that aren't your own" on public.referral_responses
    with check (
      ((select auth.uid()) = responding_profile_id)
      and ((select auth.uid()) <> (select rr.requesting_profile_id from referral_requests rr where rr.id = referral_responses.referral_request_id))
      and exists (select 1 from referral_requests rr where rr.id = referral_responses.referral_request_id and rr.status in ('open', 'sent'))
    )$p$;
end $$;

do $$ declare d text; begin
  select pg_get_functiondef('private.demo_autorespond'::regproc) into d;
  if position('r.audience_type' in d) = 0 then
    d := replace(d,
      'select rr.id, rr.requesting_profile_id as owner, rr.state
    from referral_requests rr',
      'select rr.id, rr.requesting_profile_id as owner, rr.state, rr.audience_type, rr.audience_profile_ids
    from referral_requests rr');
    d := replace(d,
      'where p.is_demo and not private.is_sandbox_guest(p.id) and (r.state is null or p.primary_state = r.state)
        and p.referral_availability in (''yes'', ''limited'')
      order by random() limit 2',
      'where p.is_demo and not private.is_sandbox_guest(p.id)
        and case
          when r.audience_type = ''selected'' then p.id = any(coalesce(r.audience_profile_ids, ''{}''::uuid[]))
          when r.audience_type = ''trusted'' then p.referral_availability in (''yes'', ''limited'') and exists (
            select 1 from connections c where c.tier = ''trusted_colleague'' and c.status = ''accepted''
              and ((c.requester_id = r.owner and c.addressee_id = p.id) or (c.addressee_id = r.owner and c.requester_id = p.id)))
          else p.referral_availability in (''yes'', ''limited'') and (r.state is null or p.primary_state = r.state)
        end
      order by random() limit 2');
    execute d;
  end if;
end $$;

-- 2. The sandbox's New York license is seeded as reviewed (New Jersey stays
-- awaiting review, to show both states). The license guard cleared the
-- review date because the seed runs as the guest.
do $$ declare d text; begin
  select pg_get_functiondef('public.guard_licence_review'::regproc) into d;
  if position('pa.seeding' in d) = 0 then
    execute replace(d,
      '  if auth.uid() is null then
    return new;
  end if;',
      '  if auth.uid() is null then
    return new;
  end if;
  if current_setting(''pa.seeding'', true) = ''on'' and coalesce(private.cfg(''app_env''), '''') = ''demo'' then
    return new;
  end if;');
  end if;

  select pg_get_functiondef('private.seed_demo_viewer'::regproc) into d;
  if position('pa.seeding' in d) = 0 then
    d := replace(d, '  insert into licenses (profile_id, state, license_number', '  perform set_config(''pa.seeding'', ''on'', true);
  insert into licenses (profile_id, state, license_number');
    d := replace(d, '''Fictional demo license: awaiting review'');', '''Fictional demo license: awaiting review'');
  perform set_config(''pa.seeding'', '''', true);');
    execute d;
  end if;
end $$;

do $$ begin
  update licenses set reviewed_at = now()
  where reviewed_at is null and notes = 'Fictional demo license' and coalesce(private.cfg('app_env'), '') = 'demo';
end $$;

-- 3. Template files: the version recorded follows the version printed in
-- the file (a file swap for a template still in review isn't a new
-- version). Published templates keep the normal rule: a new file is a new
-- version that needs review.
create or replace function public.admin_set_library_file(p_document bigint, p_path text, p_version integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare old_path text; old_status text;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ '^shared/' or not exists (select 1 from storage.objects where bucket_id = 'documents' and name = p_path) then
    raise exception 'That file isn''t in the library folder.' using errcode = 'P0001';
  end if;
  select storage_path, review_status::text into old_path, old_status from documents where id = p_document and owner_scope = 'world' and library_code is not null;
  if not found then
    raise exception 'We couldn''t find that template.' using errcode = 'P0001';
  end if;
  update documents set storage_path = p_path, title = regexp_replace(title, '^PA-\d+:\s*', '') where id = p_document;
  if p_version is not null and p_version > 0 and old_status <> 'published' then
    update documents set version = p_version where id = p_document;
  end if;
  return old_path;
end;
$function$;

-- 4. Sandbox replies answer the question that was asked, and supervision
-- posts come from psychologists.
do $$ declare d text; begin
  select pg_get_functiondef('private.demo_autorespond'::regproc) into d;
  if position('r.question' in d) = 0 then
    d := replace(d,
      'select c.id, c.author_profile_id as owner from consultations c',
      'select c.id, c.author_profile_id as owner, c.question from consultations c');
    d := replace(d,
      'values (r.id, responder, ''reply'', ''I''''d start by naming what hasn''''t worked and agreeing one small, concrete goal for the next three sessions. The Case Consultation Template is a good way to frame it if you want more input.'');',
      'values (r.id, responder, ''reply'', (case
      when r.question ~* ''(leave|cover|hand-?off|away|vacation|sabbatical|parental|maternity|paternity)'' then ''For leave, I''''d agree the handoff in writing first: who covers which clients, how urgent contacts reach them, and when the coverage summary goes over. The Extended Leave Pack in the Practice Library has a good checklist for it.''
      when r.question ~* ''(refer|wait ?list)'' then ''I''''d send two or three names that fit the client''''s needs, insurance and location, and offer a short call with the colleague first. It makes the transfer feel like continuity rather than a goodbye.''
      when r.question ~* ''(supervis|licensure|trainee)'' then ''Happy to talk it through. I''''d agree the frequency, how cases are presented and how notes are kept before the first session.''
      when r.question ~* ''(consent|telehealth|state|license|board)'' then ''Check your state board''''s current guidance first, then put it in your consent form in plain language. That covers most of the risk.''
      when r.question ~* ''(record|subpoena|documentation|notes)'' then ''Document the reasoning, not just the decision, and keep a copy of anything you release. For a subpoena, call your liability carrier before you respond.''
      when r.question ~* ''(fee|billing|insurance|superbill|payment)'' then ''Put it in your financial policy and go over it at intake. Clients rarely object to a rule they heard about up front.''
      else ''I''''d start by naming what hasn''''t worked and agreeing one small, concrete goal for the next three sessions. The Case Consultation Template is a good way to frame it if you want more input.''
    end));');
    execute d;
  end if;

  select pg_get_functiondef('private.seed_demo_network'::regproc) into d;
  if position('Offering peer consultation on split treatment' in d) = 0 then
    d := replace(d,
      '''Offering peer supervision for psychiatrists doing split treatment''',
      '''Offering peer consultation on split treatment for psychologists working with prescribers''');
    d := replace(d,
      '  for n in 1..5 loop
    a := ids[1 + floor(random() * 1200)::int];',
      '  for n in 1..5 loop
    -- Supervision posts come from psychologists, who supervise toward licensure.
    select p.id into a from profiles p where p.id = any(ids) and p.qualification_level in (''PhD'', ''PsyD'') order by random() limit 1;');
    execute d;
  end if;
end $$;

-- Existing sandbox posts: same wording and roles (demo project data).
do $$ begin
  if coalesce(private.cfg('app_env'), '') = 'demo' then
    update consultations set question = 'Offering supervision every two weeks for early-career clinicians in CBT for anxiety' where question = 'Offering fortnightly supervision for early-career clinicians in CBT for anxiety';
    update consultations set question = 'Offering peer consultation on split treatment for psychologists working with prescribers' where question = 'Offering peer supervision for psychiatrists doing split treatment';
    update consultations set question = 'Seeking consultative supervision for EMDR case conceptualization' where question = 'Seeking consultative supervision for EMDR case conceptualisation';
    update consultations c set author_profile_id = (select p.id from profiles p where p.is_demo and p.qualification_level in ('PhD', 'PsyD') and not private.is_sandbox_guest(p.id) order by random() limit 1)
    where c.kind in ('supervision_offer', 'supervision_request') and exists (select 1 from profiles p where p.id = c.author_profile_id and p.is_demo and p.qualification_level in ('MD', 'DO'));
  end if;
end $$;
