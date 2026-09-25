-- Schema fingerprint. Run on the real and demo projects; read-only.
-- Expected differences (25 Sept 2026), everything else identical:
--   functions: the demo's private.seed_demo_network omits the retired
--     p_nick branch. The other 81 functions match exactly.
--   policies: professional_events "readable by the people in them" is
--     stored with different (redundant) brackets. Same logic.
with fns as (
  select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k,
         md5(pg_get_functiondef(p.oid)) h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
),
cols as (
  select c.relname || '.' || a.attname k,
         md5(concat(format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attidentity::text)) h
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
),
pols as (
  select schemaname || '.' || tablename || '.' || policyname k,
         md5(concat(cmd, array_to_string(roles, ','), regexp_replace(qual, 'public\.', '', 'g'), regexp_replace(with_check, 'public\.', '', 'g'))) h
  from pg_policies where schemaname in ('public', 'private', 'storage')
),
cons as (
  select conrelid::regclass::text || '.' || conname k, md5(pg_get_constraintdef(oid)) h
  from pg_constraint where connamespace in ('public'::regnamespace, 'private'::regnamespace)
),
idx as (
  select indexrelid::regclass::text k, md5(pg_get_indexdef(indexrelid)) h
  from pg_index i join pg_class c on c.oid = i.indrelid
  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
),
trg as (
  select tgrelid::regclass::text || '.' || tgname k, md5(pg_get_triggerdef(oid)) h
  from pg_trigger t
  where not tgisinternal
    and (tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace, 'private'::regnamespace)) or tgname = 'enforce_invitation')
),
fgr as (
  select n.nspname || '.' || p.proname k,
         md5(concat(has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE'))) h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
),
tgr as (
  select c.relname k,
         md5(concat(has_table_privilege('anon', c.oid, 'SELECT'), has_table_privilege('authenticated', c.oid, 'SELECT'),
                    has_table_privilege('anon', c.oid, 'INSERT'), has_table_privilege('authenticated', c.oid, 'UPDATE'), c.relrowsecurity,
                    (select string_agg(attname, ',' order by attnum) from pg_attribute
                      where attrelid = c.oid and attnum > 0 and not attisdropped and has_column_privilege('authenticated', c.oid, attnum, 'SELECT')))) h
  from pg_class c
  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace) and c.relkind in ('r', 'v')
)
select 'functions' part, count(*) n, md5(string_agg(k || h, ',' order by k)) fingerprint from fns
union all select 'columns', count(*), md5(string_agg(k || h, ',' order by k)) from cols
union all select 'policies', count(*), md5(string_agg(k || h, ',' order by k)) from pols
union all select 'constraints', count(*), md5(string_agg(k || h, ',' order by k)) from cons
union all select 'indexes', count(*), md5(string_agg(k || h, ',' order by k)) from idx
union all select 'triggers', count(*), md5(string_agg(k || h, ',' order by k)) from trg
union all select 'function_grants', count(*), md5(string_agg(k || h, ',' order by k)) from fgr
union all select 'table_grants', count(*), md5(string_agg(k || h, ',' order by k)) from tgr;
