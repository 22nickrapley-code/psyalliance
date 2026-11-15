# PsyAlliance v12: migration note

One file: `supabase/migrations/0135_v11.sql`. It's safe to run more than once, and it was run twice on a local copy with no errors.

What it does:

1. **Security (QA S3).** Closes `founding_places_before_v4`, the empty backup table made in v4, to members and visitors. It turns on row-level security and removes all grants. The table and anything in it are kept.
2. **Referral titles (QA M1).** Ordinary abbreviations (QA, ED, ER, OT, PT, SW, NP, AM, PM, HR, IT, UK, US, EU, GP, TV) no longer count as client initials. Other pairs of capitals, such as "JD", are still refused.
3. **Cover history (QA C1).** Agreeing cover no longer adds "Handover is still to be confirmed" to the plan history.
4. **Worked with before (QA M13).** Cancelling a plan before its first day removes its "worked with before" record. Plans already cancelled that way are tidied when the file runs.

Order: on sandbox (`xsfqeepxnmnvlhxwkfnw`) first, then on live (`vvmulsyvyjsxhcpqfpyo`). If v10 isn't on a project yet, run `0134_v10.sql` there first (and `0132_v6.sql` and `0133_v9.sql` if they haven't been run).

Check afterwards, in the SQL editor:

```sql
select relrowsecurity from pg_class where relname = 'founding_places_before_v4';
-- true
select private.referral_title_problem('Release QA · trauma referral');
-- null (allowed)
```

Then run the Supabase security adviser again; the "RLS disabled in public" error should be gone.
