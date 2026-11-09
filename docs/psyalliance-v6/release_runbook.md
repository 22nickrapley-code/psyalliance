# Release runbook: v6 (your 9 Nov walkthrough)

> Written 9 Nov 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Everything was built and checked on the local staging copy (fictional people only), with a second local copy set up as the sandbox. As you asked, the full regression suite was **not** run this time: that is for the reviewing LLM, with fresh eyes.

## What is being released

Branch `v6`, on top of `v5` (`2c887bd`). One Git bundle, `psyalliance-v6.bundle`, in your Downloads folder, and **one SQL file**: `supabase/migrations/0132_v6.sql` (also in Downloads as `psyalliance-v6-0132_v6.sql`). It is safe to run more than once.

The order is the same as v5: bring the bundle in, merge, SQL on the sandbox, deploy the sandbox, check, SQL on live, push, deploy live, check.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch $HOME/Downloads/psyalliance-v6.bundle v6:v6
git log --oneline master..v6
```

`git status` should say the working tree is clean. The last command lists one commit starting "v6:". If it lists anything else, stop and tell me. (If `log` opens a pager, press `q`.)

## Step 2: merge

```
git checkout master
git merge --ff-only v6
```

It should say "Fast-forward". Check the SQL file arrived: `dir supabase\migrations\0132_v6.sql`.

## Step 3: SQL on the sandbox

1. Supabase, project **xsfqeepxnmnvlhxwkfnw** (the sandbox), SQL Editor, New query.
2. Open `supabase\migrations\0132_v6.sql` (or `psyalliance-v6-0132_v6.sql` in Downloads) in Notepad, select all, copy, paste, Run.
3. It should finish with "Success. No rows returned". If it shows an error, copy it to me and stop.

## Step 4: deploy the sandbox

`npm run cf:deploy:demo`. Then make a **new** sandbox link in Admin, Sandbox and do the sandbox check below.

## Step 5: SQL on live

The same as step 3, on project **vvmulsyvyjsxhcpqfpyo** (live).

## Step 6: live

`git push origin master`, then `npm run cf:deploy`, then the live check.

## The sandbox check (new link)

- **Empty start.** No "What would you like to try" panel, no outgoing referrals or cover plans of your own. About two minutes in, Eli asks about cover; then every four minutes: Lena's referral, Rena's question, Sophie's cover request, Marcus's question, Maya's referral, Imani's message, James's reply.
- **Incoming cover (Eli).** Reads like an incoming referral: the track (Eli, the stages, you), The need in one box with bold titles (collapse it with the arrow), Eli's message in its own coloured box, then the choices once. Press Ask a question: the box opens in the card; send it and the conversation appears below, in the card. Done at the bottom.
- **Incoming referral (Lena).** The same. Say Not available: it moves to Completed in the Referrals list.
- **Settings.** The Sandbox panel offers "Watch a demo".

## The check (each site)

- **Hub.** A cover plan with several things waiting shows as one action ("Spring leave: 3 things need you") that opens the plan. Later snoozes it (24 hours unless you change it in Settings, "When you press Later"); a quiet line says how many are snoozed, with Show.
- **Referrals you sent.** The track runs cleanly from your disc to the colleague's; "Reply by" sits under every name; Done is always there. Add recipients shows the need you are matching at the top. Referral agreed: the middle card is centred, names sit neatly under the discs.
- **Cover you plan.** Choosing colleagues: up to two best matches per client are already chosen. Review: room between the invitations box and Your message. A colleague who can cover: "Agree cover", then "Agree cover" again to confirm. Confirm handover works without ticking the three reminders. "Change this client's needs", Save: it saves (no more "Give the plan a short name").
- **Messages.** The paperclip offers From your computer, Your library (My files and saved templates) and the PsyAlliance Library.
- **Network.** Each column's count sits top right; the Worked with before period sits just under the heading.
- **Photos.** Once you have a photo on your profile, your disc in the workspace shows it, and so does every colleague's who has one. (Sandbox colleagues keep initials, by design.)
- **Homepage.** No founding counts in the hero; one green for Cover, Referrals and Consult; the founders' story has no photo and XXX for both names; the founding block at the bottom is two sentences.
- **Sign-up.** Step 4 reads "Once your license is verified, you can use everything PsyAlliance offers." The founding box is two sentences.
- **Profile, Fill in from a link.** Next to a found photo: why, and "Leave this photo out".
- **Admin, Library.** Publish is always available to you ("Approve and publish"), with a note when reviewer approvals are missing.

## Rollback

- **The site:** Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back.
- **The database:** see the migration note. Rolling back the site is normally enough; the new functions are unused by v5.
