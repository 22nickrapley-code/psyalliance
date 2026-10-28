# Release runbook: version 14 (the old parts brought back into the v13 workspace)

> Written 28 Oct 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Everything was tested on the local staging copy (fictional people only). The review page (sent in the chat) shows each screen before and after, with my view of each change.

## What is being released

Branch `followup-old-vs-new`, on top of `d96a497` (the version 13 release you already have live), delivered as one Git bundle (`psyalliance-v14.bundle`). It contains:

- the parts of the 18 Oct version you picked: group conversations (G1), Report on a message (G2), topic labels on questions (G3), "Selected referrals only" (G4), shortlist ranks and reasons (G5), the clarifying-question tick (G6), Exclude from suggestions (G7), Messages in the phone bar (D2), next-step prompts on referral cards (D3), the Hub's greeting, welcome card, year line and four discussions (D4), the fuller colleague profile (D6), Library suggestions in Refer, Consult and Cover (D7), availability explanations (D8), and all five trusted colleagues on Network (D9). D1 and D5 were not picked and are not in;
- the muted-tint colours, with a second contrast pass (about 30 small-text colours darkened);
- the self-playing "Watch example" demos on every main screen, on the public Demos page, the Library page and inside the product;
- **one migration, `0122_followup_old_parts.sql`**: functions only, no tables and no data. It replaces `thread_json`, `workspace_threads`, `workspace_pulse`, `workspace_thread`, `workspace_tiers`, `workspace_people`, `workspace_boot`, `workspace_slice`, `discussion_json`, `workspace_discussion`, `my_availability`, `set_my_availability` (a seventh argument with a default; the six-argument version is dropped) and `consult_reply` (a fourth argument with a default), and adds `workspace_year` and `workspace_profile_signals`. It applies to **both** projects.
- the undo: `supabase/rollbacks/0122_followup_old_parts.rollback.sql` puts every one of those functions back exactly as it was (checked byte for byte, including permissions).

## Order of work

The version 13 code keeps working on the database once 0122 is in (tested), so the SQL can go in first. Group conversations show as ordinary conversations in the version 13 site until it is replaced, so deploy straight after the SQL.

1. Bring the bundle in (adds a branch only).
2. Sandbox project (`xsfqeepxnmnvlhxwkfnw`): read the four numbers, run 0122, read them again.
3. Merge on your computer, build and deploy the sandbox Worker (`psyalliance-demo`). Ten-minute check on `https://sandbox.psyalliance.org`.
4. Live project (`vvmulsyvyjsxhcpqfpyo`): the same four numbers, 0122, the four numbers again.
5. `git push origin master`, build and deploy the live Worker (`psyalliance`). The same ten-minute check on `https://psyalliance.org`.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-v14.bundle followup-old-vs-new:followup-old-vs-new
git log --oneline master..followup-old-vs-new
```

`git status` must say the working tree is clean. The last command lists only commits whose names start with "Version 14". If it lists anything else, stop and tell me. The bundle's checksum is in the message that delivered it.

## Steps 2 and 4: the four numbers and the SQL (each project)

Run this first in the project's SQL editor (it only reads) and write the answer down:

```sql
select
  (select count(*) from do_not_work_with where block_type = 'exclude') as exclusions,
  (select count(*) from (select conversation_id from conversation_participants group by conversation_id having count(*) > 2) g) as group_conversations,
  (select count(*) from profiles where referral_availability = 'limited') as selected_referrals_only,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('workspace_year', 'workspace_profile_signals')) as new_functions;
```

`new_functions` is 0 before and **2** after. The other three numbers must not change. `exclusions` are the people members hid from suggestions in the 18 Oct version (they start to count again once 0122 is in). `group_conversations` are conversations of three or more people (they start to show in Messages). If the live project's `group_conversations` is more than 0, deploy straight after the SQL.

Then copy the SQL (from your branch, so you do not have to open the file):

```
git show followup-old-vs-new:supabase/migrations/0122_followup_old_parts.sql | clip
```

Paste it whole into a new query and run it. Expect "Success. No rows returned" (a notice about a function that does not exist is fine). If it shows an error, stop and send me the message; it is written to be run again, so the fix after a failure is to run the same file once the cause is dealt with. **Run the sandbox first, and do not run live until the sandbox is done and checked.**

## Steps 3 and 5: code and deploys

```
git checkout master
git merge --ff-only followup-old-vs-new
```

`--ff-only` stops if your master has moved on from `d96a497`; if it does, tell me rather than forcing it. Build and deploy the sandbox Worker, then (after the live SQL) `git push origin master`, then build and deploy the live Worker, each the way you did for version 13. The Cloudflare build still refuses Next.js 15 after 22 Oct (C-48); the version 13 runbook has the flag. I cannot run the Cloudflare build here, so the Worker's size is not measured. The standard `next build` passes.

## The ten-minute check (each site)

- Open the site as the guest (sandbox) or a test member (live). The Hub opens with "Good morning", "Good afternoon" or "Good evening" and the member's first name, and lists four discussions.
- "Watch example" on the Hub, Cover and Referrals plays itself with a moving pointer; try Pause, Back, Next and Watch again.
- Cover: open a plan. The five-step bar and "Needs from you" are there. A list row says "Next: ..." or "Done: ...".
- Start a referral to the choosing step: each colleague has a number and reasons.
- Availability: three referral choices, "Last confirmed", "At a glance", "How it's used".
- A colleague's profile: "Exclude from suggestions" under "Your controls".
- Messages has a "Group" chip. On a phone the bottom bar is Hub, Cover, Referrals, Consult, Messages.
- Live only: open Admin, Moderation and look for one test report of a message ("Message #...").

## Rollback

- **The site:** Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, choose the previous version, Roll back. About a minute. The database does not need to change for the version 13 site to work.
- **The SQL, only if you want it removed:** `git show followup-old-vs-new:supabase/rollbacks/0122_followup_old_parts.rollback.sql | clip`, paste and run in each project where 0122 was run. It restores every function exactly and changes no data. After it, `new_functions` reads 0. Rolling back the SQL while the version 14 site is live breaks the version 14 site (it calls the two new functions), so roll the site back first.

## What I tested, and what I could not

See `release_notes.md` for the numbers and for what is known to be smaller than the old version. Not testable here: the SQL on the two real projects, the Cloudflare build and Worker size, a real phone, a keyboard-only pass, a screen reader, real email.
