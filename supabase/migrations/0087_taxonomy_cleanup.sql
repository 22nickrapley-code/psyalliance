-- Taxonomy audit (launch brief, section 4).
--   Languages: "Indian" and "Lebanese" aren't languages; duplicates merged
--   (Chinese into Mandarin, Cambodian into Khmer, Creole into Haitian
--   Creole, Filipino into Tagalog, Farsi into Persian); clearer names.
--   Insurance: the list was a dated national one (PacifiCare, Coventry,
--   Tenet Choices...). Merged into the plans members actually name, with
--   the major New York, Massachusetts and Texas payers added.
--   Modalities: current names, and common evidence-based ones added.
-- Merges move any member's selections to the surviving value first.

create or replace function pg_temp.merge_lookup(p_category text, p_from text, p_to text)
returns void language plpgsql as $$
declare f bigint; t bigint;
begin
  select id into f from public.lookup_values where category = p_category and value = p_from;
  select id into t from public.lookup_values where category = p_category and value = p_to;
  if f is null or t is null or f = t then return; end if;
  delete from public.profile_lookup_values a
  where a.lookup_value_id = f and exists (select 1 from public.profile_lookup_values b where b.profile_id = a.profile_id and b.lookup_value_id = t);
  update public.profile_lookup_values set lookup_value_id = t where lookup_value_id = f;
  delete from public.lookup_values where id = f;
end $$;

create or replace function pg_temp.rename_lookup(p_category text, p_from text, p_to text)
returns void language plpgsql as $$
begin
  update public.lookup_values set value = p_to where category = p_category and value = p_from
    and not exists (select 1 from public.lookup_values where category = p_category and value = p_to);
end $$;

create or replace function pg_temp.drop_lookup(p_category text, p_value text)
returns void language plpgsql as $$
declare f bigint;
begin
  select id into f from public.lookup_values where category = p_category and value = p_value;
  if f is null then return; end if;
  delete from public.profile_lookup_values where lookup_value_id = f;
  delete from public.lookup_values where id = f;
end $$;

-- The demo seed picked insurance by a fixed id range and one merged
-- language id; make it read the current lists instead.
do $$
declare def text;
begin
  def := pg_get_functiondef('private.seed_demo_network(uuid)'::regprocedure);
  def := replace(def, 'select x from generate_series(103, 128) x order by random()', 'select id as x from lookup_values where category = ''insurance'' and value <> ''Other'' order by random()');
  def := replace(def, 'array[181,181,181,140,', 'array[181,181,181,171,');
  execute def;
end $$;

-- Sample referrals and cover cases in the demo name plans by text.
do $$
declare fn text; def text;
begin
  foreach fn in array array['private.seed_demo_network(uuid)', 'private.seed_demo_viewer(uuid)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    def := replace(def, '''AETNA Health, Inc.''', '''Aetna''');
    def := replace(def, '''CIGNA HealthCare (PPO)''', '''Cigna''');
    def := replace(def, '''Out of Pocket Pay''', '''Self-pay (out of network)''');
    def := replace(def, '''United Healthcare''', '''UnitedHealthcare / Optum''');
    execute def;
  end loop;
end $$;

-- Languages
select pg_temp.drop_lookup('language', 'Indian');
select pg_temp.drop_lookup('language', 'Lebanese');
select pg_temp.merge_lookup('language', 'Chinese', 'Mandarin');
select pg_temp.merge_lookup('language', 'Cambodian', 'Khmer');
select pg_temp.merge_lookup('language', 'Creole', 'Haitian');
select pg_temp.rename_lookup('language', 'Haitian', 'Haitian Creole');
select pg_temp.merge_lookup('language', 'Filipino', 'Tagalog');
select pg_temp.rename_lookup('language', 'Tagalog', 'Tagalog (Filipino)');
select pg_temp.merge_lookup('language', 'Farsi', 'Persian');
select pg_temp.rename_lookup('language', 'Persian', 'Persian (Farsi)');
select pg_temp.rename_lookup('language', 'Dineh', 'Navajo (Diné)');
select pg_temp.rename_lookup('language', 'Taiwanese', 'Taiwanese Hokkien');
select pg_temp.rename_lookup('language', 'Dakota', 'Dakota (Sioux)');

-- Insurance
select pg_temp.merge_lookup('insurance', 'AETNA Inc. (Open Choice)', 'AETNA Health, Inc.');
select pg_temp.merge_lookup('insurance', 'Coventry Health Care', 'AETNA Health, Inc.');
select pg_temp.merge_lookup('insurance', 'Coventry Health Care (PPO)', 'AETNA Health, Inc.');
select pg_temp.rename_lookup('insurance', 'AETNA Health, Inc.', 'Aetna');
select pg_temp.merge_lookup('insurance', 'BlueCross BlueShield (GroupCare)', 'Blue Cross and Blue Shield (HMO)');
select pg_temp.rename_lookup('insurance', 'Blue Cross and Blue Shield (HMO)', 'Blue Cross Blue Shield');
select pg_temp.rename_lookup('insurance', 'CIGNA HealthCare (PPO)', 'Cigna');
select pg_temp.merge_lookup('insurance', 'United HealthCare (Options PPO)', 'United Healthcare');
select pg_temp.merge_lookup('insurance', 'United Behavioral Health', 'United Healthcare');
select pg_temp.merge_lookup('insurance', 'PacifiCare Behavioral Health', 'United Healthcare');
select pg_temp.rename_lookup('insurance', 'United Healthcare', 'UnitedHealthcare / Optum');
select pg_temp.merge_lookup('insurance', 'Tenet Choices, Inc. (Medicare PPO)', 'Medicare');
select pg_temp.rename_lookup('insurance', 'Out of Pocket Pay', 'Self-pay (out of network)');
select pg_temp.drop_lookup('insurance', 'American LIFECARE, Inc.');
select pg_temp.drop_lookup('insurance', 'BestCare, Inc.');
select pg_temp.drop_lookup('insurance', 'FARA PPO Network');
select pg_temp.drop_lookup('insurance', 'Health Plus');
select pg_temp.drop_lookup('insurance', 'Horizon Behavioral Services');
select pg_temp.drop_lookup('insurance', 'Managed Health Network');
select pg_temp.drop_lookup('insurance', 'Ochsner Health Plan');
select pg_temp.drop_lookup('insurance', 'PPOplus, LLC');
select pg_temp.drop_lookup('insurance', 'Private Healthcare Systems');
select pg_temp.drop_lookup('insurance', 'Tenet Choices, Inc.');
select pg_temp.drop_lookup('insurance', 'Vantage Health Plan, Inc.');
insert into public.lookup_values (category, value)
select 'insurance', v from unnest(array[
  'Anthem', 'Carelon Behavioral Health', 'EmblemHealth', 'Fidelis Care', 'Harvard Pilgrim Health Care',
  'Humana', 'MVP Health Care', 'Oxford Health Plans', 'Tricare', 'Tufts Health Plan'
]) v
on conflict (category, value) do nothing;

-- Treatment modalities and specialisms
select pg_temp.rename_lookup('treatment_modality', 'Cognitive/Behavioral', 'Cognitive Behavioral Therapy (CBT)');
select pg_temp.rename_lookup('treatment_modality', 'Behavioral', 'Behavior Therapy');
insert into public.lookup_values (category, value)
select 'treatment_modality', v from unnest(array[
  'Acceptance and Commitment Therapy (ACT)', 'EMDR', 'Exposure and Response Prevention (ERP)',
  'Trauma-Focused CBT', 'Motivational Interviewing', 'Couples Therapy', 'Family Therapy',
  'Interpersonal Therapy (IPT)', 'Medication Management'
]) v
on conflict (category, value) do nothing;
select pg_temp.rename_lookup('treatment_specialism', 'Autism/PDD', 'Autism');
select pg_temp.rename_lookup('treatment_specialism', 'Self Abuse', 'Self-harm');
