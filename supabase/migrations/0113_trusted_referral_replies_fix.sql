-- 0110's second change to private.demo_autorespond (trusted referrals are
-- answered by the people the sender trusts) didn't apply when the script was
-- pasted on Windows: the pasted text had Windows line endings, so the
-- multi-line search text no longer matched. This matches it whatever the
-- spacing or line endings, and removes the stray carriage returns.
do $$
declare d text;
begin
  d := replace(pg_get_functiondef('private.demo_autorespond'::regproc), E'\r', '');
  d := regexp_replace(d, '(when r\.audience_type = ''trusted'' then p\.referral_availability in \(''yes'', ''limited''\) and exists \()\s+select 1 from connections c where c\.tier = ''trusted_colleague'' and c\.status = ''accepted''\s+and \(\(c\.requester_id = r\.owner and c\.addressee_id = p\.id\) or \(c\.addressee_id = r\.owner and c\.requester_id = p\.id\)\)\)', '\1select 1 from trusted_colleagues t where t.profile_id = r.owner and t.colleague_id = p.id)');
  execute d;
end $$;

select strpos(pg_get_functiondef('private.demo_autorespond'::regproc), 'from connections c where c.tier') = 0 as trusted_fix_ok,
       left(md5(pg_get_functiondef('private.demo_autorespond'::regproc)), 8) as parity_code;
