# Release runbook: Release B (Cover, Referrals, Consult, Messages, Availability and relationships)

> Written 30 Oct 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Release B has **one SQL file** (`0124`, two small parts: a read-only message search function, and a one-line fix to when a new conversation's first message counts as unread). Everything was tested on the local staging copy (fictional people only). **No email behaviour was changed.** Release C has not been started.

## What is being released

Branch `release-b`, delivered as one Git bundle (`psyalliance-release-b.bundle`). It needs version 14 (`c7e14b9`) in your repository, as the earlier bundles did. The bundle is cumulative: it also contains Release A.1, Release A and version 15, in case any of them is not in your `master` yet.

The order is: bring the bundle in, merge, run the SQL on the sandbox, deploy the sandbox, check, then the same for live.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git log --oneline -1 master
git fetch C:\Users\Nick\Downloads\psyalliance-release-b.bundle release-b:release-b
git log --oneline master..release-b
```

- `git status` will list your three Cloudflare flag files (`package.json`, `package-lock.json`, `scripts/deploy-demo.mjs`). That is expected; the merge does not touch them.
- The last command lists what is new to `master`. If Release A.1 is already merged you will see **seventeen lines**, all starting "Release B". If A.1 is not merged yet you will see **twenty-three**: six "Release A.1" lines, then the seventeen Release B lines. If Release A is not merged either, there will be eight more "Release A (part" lines and four "Version 15" lines. Anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only release-b
```

If it refuses to fast-forward, do not force it; tell me what `git log --oneline -3 master` shows.

## Step 3: SQL on the sandbox first

Supabase, project `xsfqeepxnmnvlhxwkfnw` (sandbox), SQL editor. Open `supabase/migrations/0124_message_history_and_first_unread.sql` from the repository, paste all of it, Run. Expect "Success. No rows returned." Then run these two checks together:

```sql
select to_regprocedure('public.search_message_history(text,bigint,integer)');
select position('1 millisecond' in pg_get_functiondef('private.context_conversation(text,text,uuid[],uuid,uuid,text,timestamptz)'::regprocedure)) > 0 as first_message_fix_in_place;
```

The first should show `search_message_history(text,bigint,integer)`, not empty. The second should show `true`. (If you have not yet run `0123_unread_message_count.sql` on this project, run it first; it is from Release A and is in the same folder.)

## Step 4: sandbox site

`npm run cf:deploy:demo`, then the ten-minute check below on `https://sandbox.psyalliance.org`. **Also try one 15 MB file in a message** (see Messages below): it is the one thing I could not test on Cloudflare.

## Step 5: live

1. Same SQL on project `vvmulsyvyjsxhcpqfpyo` (live).
2. `git push origin master`
3. `npm run cf:deploy`
4. The ten-minute check on `https://psyalliance.org`.

## The ten-minute check (each site)

Use your own account. Use a phone (or the browser narrowed to a phone) for the second half.

**Cover**
- The page button says **Plan cover**. The pop-up steps are headed **Plan cover, Build your client list, Choose colleagues, Review your cover plan**. With one client, the matching step has no client tabs and no By client / By colleague switch.
- Start a plan and leave the name empty, add a date. Back on the Cover page the draft is called "Cover draft · date". Delete it: the box names the draft and asks first.
- Add three or four clients and go to matching. **No colleague is ticked for you.** Choose **By colleague**, tick two clients, **Apply**: one note says who and lists "Added to", "Already selected for" and "Excluded" with reasons. Nothing is sent.
- Go back and change one client's treatment area after choosing colleagues: a note says who no longer fits and was removed, and nobody replaces them. **Dismiss** clears it.
- Review: the section **"What each colleague would be asked"** shows each colleague's requests, who is asked first and who is queued, their overall spaces and "Confirmed N days ago". With one colleague there are no up or down arrows. **Change this client** and **Change colleagues** take you to the right step. Close the box without sending.
- **Calendar**: titled Cover calendar, filters Both directions / Your cover plans / Cover for colleagues, a Today button. Today and a day you pick look different. Click a day with a plan: the pop-up shows the two directions one above the other, and a direction with nothing in it is a thin strip that says so. On a phone: small dots and counts, not cut-off titles, and the "Needs your reply" pill fits its words.
- **Plan windows**: open a plan you made, then a colleague's plan to you. The summary line of the colleague's plan says what *you* have been asked ("1 invitation still needs your reply"), and the keyboard focus box starts on the close button. A handover window is headed **Confirm handover for Client N**. An account with no Cover plans at all shows "You have no cover plans yet. Choose Plan cover to ask colleagues to cover your clients."

**Referrals**
- Refer a client: **Main need** opens a searchable list; typing "anx" narrows it. Starting from a colleague's profile keeps them as the recipient, or explains why they cannot be.
- After sending (use a test colleague on the sandbox): **Request sent, Colleague interest, Placement confirmed** with only Request sent marked. Title reads "Client referral · " and the need.

**Consult**
- Consult has **Find or start a group**. Ask a question to one person: review says "1 recipient" and names them. Ask to a few: it names all and says how many. Nothing posts until you tick the confirmation and press **Post question**.

**Messages**
- **Search, Messages**: type a word from an old message (the first 200 messages of a conversation are loaded; pick something older than that if you can). Results show who, when and which conversation, with your word highlighted. Click one: the conversation opens at that message and it is highlighted for a few seconds. **Show more** loads the next 20. (Before you run the SQL the window says searching older messages is not switched on yet.)
- **Drafts**: type half a message in one conversation, switch to another, type something different, reload: both come back.
- **Files**: attach a small file to a message but do not send; reload: it is still there with its name and size. Send it: it arrives once. **Attach a 15 MB file and send it.** (Try a 25 MB file too: it should be refused with a plain message.)
- **Voice**: record a few seconds but do not send; reload: "Voice note ready to send". Send it and play it.
- A colleague with several conversations with you shows "3 conversations" on their row, separate from the unread number.
- **First message unread (after the SQL):** this cannot be shown on the sandbox, whose colleagues are simulated (test MB-10 proves it locally with two real accounts). On live, the first time a colleague presses **Discuss first** on one of your referrals, their question should count as 1 unread message on that colleague's row and in the menu.

**Network and availability**
- Network: each person says why they are there; where nothing was recorded it says so. **Add to trusted colleagues** and **Remove from trusted colleagues** work and are separate from "worked with before".
- Your circle: no two people sit on top of each other; the lists beneath have everyone (five to a page).
- Availability: the window is headed **Your availability**; spaces are one number; virtual and in-person are set per state; "Confirmed N days ago" is the same on the window, your profile and in Network.

**Saving**: start a Cover plan and type a name. Switch the device to airplane mode, type a different name: the footer says "Could not save your changes". Turn the connection back on and **reload the page** (the browser asks whether to leave; leave). A message says "We put back changes that had not saved last time and are saving them now", and your newest name is the one in the draft.

**Phone (390, then 320)**: Cover review, calendar, availability and Network fit the screen with nothing scrolling sideways.

## Rollback

The site: Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, choose the previous version, Roll back. About a minute.

The SQL needs no rollback after a site rollback (the previous site never calls it). If you want it gone anyway: `drop function if exists public.search_message_history(text, bigint, integer);`.

## Things I could not test, so please look at them

- **Cloudflare and uploads of 10 to 20 MB.** The upload limit fix is a build setting (`middlewareClientMaxBodySize`). It works in the local production build; I could not run Cloudflare. If a 15 MB file fails on the sandbox, tell me before going live.
- **A real phone**, **a real microphone**, **keyboard-only and screen-reader use**. Everything on phones was tested in a phone-sized browser with touch; voice used a fake microphone.
- **Message search at your real message volume.** It reads the live message table. If it feels slow on live, tell me and I will add an index.
- **Real email.** Not part of Release B and nothing in it sends email.
- **Races across devices.** Sequential outreach, competing acceptance and late replies are covered by the existing tests from earlier releases, which I re-ran, but I did not run them on a second real device.
