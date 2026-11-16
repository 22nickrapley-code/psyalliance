# PsyAlliance v13: migration note

One new file: `supabase/migrations/0136_v13.sql`. It's safe to run more than once, and it was run twice on a local copy with no errors.

Run it on **both** projects, sandbox first, after `0135_v11.sql`. (The read-only security check on 15 Nov showed 0135 is already on live.)

What it does:

1. **Calmer sandbox** (demo site only; harmless on live).
   - Five arrivals instead of eight, about seven to eight minutes apart. The first still comes after two minutes.
   - The five are: Eli's cover request, Lena's referral, Marcus's consult question, James thanking Rachel for her reply (a small win), and Imani's message.
   - The screen also holds back a new arrival while three or more things already need the visitor on the Hub.
2. **Library files closed to unverified accounts.** Until now, any signed-in account could download Library files straight from storage, getting around the rule that templates open once a license is verified. Now only verified members and admins can read them. Files you've published for public download keep their own rule.
3. **Search paths.** Fixed search paths on the twelve small helper functions the security check warned about.
4. **Flood limit.** The public demo's step counter can't be used to flood the database: past 300 events a minute, extra ones are dropped.

Checks afterwards, in the SQL editor:

```sql
select polname from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'shared%read%';
-- shared documents are readable by verified members
select proconfig from pg_proc where proname = 'state_name';
-- {"search_path=public, extensions"}
```

Run the Supabase security check again. The search-path warnings should be gone.
