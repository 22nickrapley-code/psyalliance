# Release runbook: v5 (your 8 Nov walkthrough)

> Written 8 Nov 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Everything was tested on the local staging copy (fictional people only), with a second local copy set up as the sandbox.

## What is being released

Branch `v5`, on top of `v4` (`9a4cbf2`). It comes as one Git bundle, `psyalliance-v5.bundle`, in your Downloads folder, with **one SQL file**: `supabase/migrations/0131_v5.sql` (also in Downloads as `psyalliance-v5-0131_v5.sql`). It is safe to run more than once.

Consultation groups arrive **switched off on both sites** (Admin, Features turns them back on). AI stays as you left it.

The order: bring the bundle in, merge, SQL on the sandbox, deploy the sandbox, check, SQL on live, push, deploy live, check.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-v5.bundle v5:v5
git log --oneline master..v5
```

`git status` should say the working tree is clean. The last command lists only commits whose names start with "v5:". If it lists anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only v5
```

If `--ff-only` stops, tell me rather than forcing it.

## Step 3: SQL on the sandbox

1. Supabase, project **xsfqeepxnmnvlhxwkfnw** (the sandbox), SQL Editor, New query.
2. Open `psyalliance-v5-0131_v5.sql` from Downloads in Notepad, select all, copy, paste, Run.
3. It should finish with "Success. No rows returned". If it shows an error, copy it to me and stop.

## Step 4: deploy the sandbox

`npm run cf:deploy:demo`. Then make a **new** sandbox link in Admin, Sandbox (an old link keeps the world it already has) and do the sandbox check below.

## Step 5: SQL on live

The same as step 3, on project **vvmulsyvyjsxhcpqfpyo** (live).

## Step 6: live

`git push origin master`, then `npm run cf:deploy`, then the live check. Open `https://psyalliance.org` straight after the deploy, as last time.

## The sandbox check (new link)

- **A calm start.** The Hub says "You're up to date"; no unread messages or notifications. About two minutes in, Eli asks about cover; then one colleague every four minutes, eight in all. Imani's message is about a client moving states, not the Thursday Circle.
- **Guided tasks.** Pick each of the five. The step sits in the pop-up's header beside the title ("Trying: Refer a client · Step 1 of 3"), and the thing to use next has a gold outline that moves as you go. After you send, it keeps going: open the offer, press "Referral agreed" or "Cover agreed", confirm the handover, confirm cover arranged. Nobody else gets in touch while a task is open.
- **Settings.** The Sandbox panel is at the top.

## The check (each site)

- **Hub.** The three service cards and the three availability boxes are compact and line up (Consult no longer sits lower). Demos pop-up: the "Show Need a demo?" switch is at the top.
- **Colours.** Referrals are blue everywhere; Cover green; Consult purple. In the Referrals and Cover lists, Active rows are green and Completed grey.
- **Referrals.** Review step: room around "How long each colleague has to reply" and before Timeframe. The journey line now runs from your disc through the stages to the colleague's disc.
- **Cover, choosing colleagues** (try a plan with 7 or 8 clients). "Next client" in the footer and at the end of each list; clicking a lower client keeps the list where it was; the last client is not cut off.
- **Cover review.** It asks "How should your N clients be asked?" first. One at a time shows the order for each client, with drag and the arrows; reordering keeps the client open. Everyone at once shows no order. By colleague lists the colleague with most requests first.
- **Consult.** Opens on Active; the tabs fit; a followed question has a gold "Following" label and no gold box. Ask a question offers six audiences (trusted, worked with before, suggested by PsyAlliance, one colleague, a few colleagues, the whole network). No consultation group anywhere.
- **Network.** Each column only as long as its own list (five a page, its own pager), every colleague box the same size, and the 6 mo / 12 mo / 2 yrs / 3 yrs / All filter inside the purple header.
- **A colleague's profile.** Professional history: the number of collaborations, then a line for each (three a page).
- **Messages.** "Just chatting" is a tidy block; a line under the tabs explains the red dot. Record a 6-second voice note, send it, and play it while the page is open: it plays to the end.
- **Your profile.** Paste your Psychology Today link or your website and press "Fill in from this link": the fields and (for Psychology Today) your photo fill in; then Save profile saves. If any field is wrong, Save now opens that section and points at it instead of doing nothing.
- **Homepage and sign-up.** "40 of 40 founding places left in ..." for each open state.
- **Admin, Features.** Consultation groups: Off. Switching it on brings groups back on the next page load.

## Rollback

- **Groups only:** Admin, Features. Immediate, no deploy.
- **The site:** Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back.
- **The database:** 0131 adds one column and one setting and replaces functions with the same calls. Rolling back the site is normally enough (see the migration note).
