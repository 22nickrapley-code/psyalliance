-- Demo seed fix. Since 0087 the seed picks insurance plans from the live
-- list, which includes "Self-pay (out of network)" (130); the separate 25%
-- chance of adding 130 could then collide. Applied to both projects on
-- 25 Sept 2026 when the demo project was built.
do $$
declare def text;
begin
  def := pg_get_functiondef('private.seed_demo_network(uuid)'::regprocedure);
  def := replace(def,
    'insert into profile_lookup_values values (pid, 130, null); end if;',
    'insert into profile_lookup_values values (pid, 130, null) on conflict do nothing; end if;');
  execute def;
end $$;
