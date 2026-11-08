# Release runbook: v4 (the final build before the pilot)

> Written 6 Nov 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Everything was tested on the local staging copy (fictional people only).

## What is being released

Branch `v4`, on top of your `master` (`3eef001`, v3). It comes as one Git bundle, `psyalliance-v4.bundle`, in your Downloads folder, with **one SQL file**: `supabase/migrations/0130_v4_final.sql` (also in Downloads as `psyalliance-v4-0130_v4_final.sql`). It is safe to run more than once.

AI arrives **switched off on both sites**. Nothing about AI changes for anyone until you switch it on in Admin, AI.

The order: bring the bundle in, merge, SQL on the sandbox, deploy the sandbox, check, SQL on live, push, deploy live, check.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-v4.bundle v4:v4
git log --oneline master..v4
```

`git status` should say the working tree is clean. The last command lists only commits whose names start with "v4:". If it lists anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only v4
```

If `--ff-only` stops, tell me rather than forcing it.

## Step 3: SQL on the sandbox

1. Supabase, project **xsfqeepxnmnvlhxwkfnw** (the sandbox), SQL Editor, New query.
2. Open `psyalliance-v4-0130_v4_final.sql` from Downloads in Notepad, select all, copy, paste, Run.
3. It should finish with "Success. No rows returned". If it shows an error, copy it to me and stop.

## Step 4: deploy the sandbox

`npm run cf:deploy:demo`, then the check below on `https://sandbox.psyalliance.org`.

## Step 5: SQL on live

The same as step 3, on project **vvmulsyvyjsxhcpqfpyo** (live).

## Step 6: live

`git push origin master`, then `npm run cf:deploy`, then the same check on `https://psyalliance.org`. Open `https://psyalliance.org` straight after the deploy: last time Wrangler warned that your local settings don't list the psyalliance.org custom domains. If the site doesn't load, re-add the two domains in Cloudflare, Workers and Pages, psyalliance, Settings, Domains and Routes.

## The check (each site)

- **Agreeing after a discussion.** On a client where a colleague only asked a question, "Cover agreed" now says the colleague will be asked to confirm. The client shows "Waiting for confirmation". The colleague sees "Confirm" and "That's not right". If the colleague had said "I can cover", it counts straight away. The same for referrals.
- **Closing or reducing practice.** "From" (not "Transfer from"), an optional "Until", and "Until further notice". No "Permanent placements" line. An open-ended plan has "End this cover".
- **Change details.** A sent plan has "Change details" (dates, name, message) and each client "Change this client's needs". A sent referral has "Change details". Colleagues are told.
- **Referrals.** A placed or withdrawn referral has "Close", which moves it to Completed. The review step lists any gaps for the chosen colleagues.
- **Consult.** Active cards green, Resolved grey, a gold edge on what you follow.
- **Consultation group with nobody in it yet.** Posting says "Currently no members of your group"; Continue draft opens the group.
- **Membership.** As a verified member, Actions has "Activate your membership" (founding member, free for life, or $30 a month; nothing charged).
- **States (Admin).** NY and MA show "Building the founding circle". A referral to the whole network for a client there is refused until you press "Founding circle complete".
- **Continuity.** "Still correct" on the plan, and on the yearly reminder in Actions.
- **AI (sandbox first).** Admin, AI: it says Off. If it warns that no Anthropic key is set, add `ANTHROPIC_API_KEY` to that Worker first (Cloudflare, Workers and Pages, the worker, Settings, Variables and Secrets). Switch AI on. On the Hub, the "Ask PsyAlliance" line appears. On Refer a client, "Describe the referral instead" appears, with a microphone button in Chrome, Edge or Safari. On Plan cover, step 2, you can drop a spreadsheet. Switch AI off: both disappear on the next page load.

## Rollback

- **AI only:** Admin, AI, Switch AI off. Immediate, no deploy.
- **The site:** Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back.
- **The database:** 0130 adds columns and tables and replaces functions with the same calls. Rolling back the site is normally enough. If you do roll the site back, tell me: colleagues would have no Confirm button for agreements recorded after a discussion, so I would give you a one-line SQL to make those agreements count straight away.
