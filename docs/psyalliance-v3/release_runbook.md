# Release runbook: v3 (the corrective release)

> Written 5 Nov 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Everything was tested on the local staging copy (fictional people only).

## What is being released

Branch `v3`, on top of your `master` (`1e9124a`, version 2 with the 0128 fix). It comes as one Git bundle, `psyalliance-v3.bundle`, in your Downloads folder. It has **one SQL file**: `supabase/migrations/0129_v3_corrective.sql`. It is safe to run more than once.

The order: bring the bundle in, merge, SQL on the sandbox, deploy the sandbox, check, SQL on live, push, deploy live, check.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-v3.bundle v3:v3
git log --oneline master..v3
```

`git status` should say the working tree is clean (or only list your Cloudflare-flag files). The last command lists only commits whose names start with "v3:". If it lists anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only v3
```

If `--ff-only` stops, tell me rather than forcing it.

## Step 3: SQL on the sandbox

1. Open Supabase, project **xsfqeepxnmnvlhxwkfnw** (the sandbox).
2. SQL Editor, New query.
3. Open `supabase\migrations\0129_v3_corrective.sql` from your psyalliance folder in Notepad, select all, copy, paste into the editor, Run.
4. It should finish with "Success. No rows returned". If it shows an error, copy the error to me and stop. Nothing is half-applied that would matter: running it again after a fix is safe.

## Step 4: deploy the sandbox

`npm run cf:deploy:demo`, then the ten-minute check below on `https://sandbox.psyalliance.org`.

## Step 5: SQL on live

The same as step 3, on project **vvmulsyvyjsxhcpqfpyo** (live).

## Step 6: live

`git push origin master`, then `npm run cf:deploy`, then the same check on `https://psyalliance.org`.

## The ten-minute check (each site)

- **Cover plan.** Open a plan. Each client shows its number first. Clients are ordered by progress, and the badges tell "agreed" apart from "handover ready". A colleague's reply reads "I can cover", "Ask a question" or "Not available".
- **Agree after a discussion.** On a client where a colleague asked a question, "Cover agreed" records the agreement. "Decline and continue search" asks for confirmation, then asks the next colleague.
- **Add recipients.** On a client with nobody left to ask, "Add recipients" opens the full matching list. You can reorder and choose one at a time or everyone at once.
- **Confirm cover arranged.** The button lights up only once every client has an agreed colleague and a ready handover. After that the plan shows "Cover arranged" and stays active until the absence ends.
- **Referrals.** A new referral to selected or trusted colleagues can go one at a time in your order, with a reply deadline. The whole network is always everyone at once. The referral window shows the journey from you to the colleague.
- **Hub.** Actions only list real work (a reply only when something is unread). Your availability has quick controls under the three service cards.
- **Bell.** It opens one window with Notifications, filters by type, search, and "Mark all read". Settings, All notifications opens the same window.
- **Consult.** Tabs read All discussions, Active, Resolved, Following, each with a count.
- **Library.** A template's overview has Open PDF, Download and Save to My Files. Saving puts a copy in a "PsyAlliance documents" folder under My files. There is no Saved pill.
- **Network.** Worked with before has 6 mo, 12 mo, 2 yrs, 3 yrs, All. Suggested colleagues are turquoise. The three lists are the same height.
- **Your own profile** (your name at the bottom of the left menu) has the same header as a colleague's.
- **Settings, Account and privacy.** "What would be useful to you at the moment?" and "How would you like colleagues to approach you?" are gone.
- **Sandbox only.** The left menu's Sandbox box has Leave and Restart. There is no Sandbox bar across the top of account pages.

## Rollback

- **The site:** Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, choose the previous version, Roll back. About a minute.
- **The database:** 0129 only adds columns and replaces functions; every function still accepts the same calls as before, so the previous site version is expected to run on top of it (I did not test that combination). Rolling back the site is normally enough. If you ever need the old functions back, ask me and I will give you the matching restore file. Do not drop the new columns: replies already recorded use them.
