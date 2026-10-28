# Release runbook: version 15 (your 16-screenshot feedback list)

> Written 28 Oct 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Version 15 has **no database change at all**: no migration, no SQL step. Everything was tested on the local staging copy (fictional people only).

## What is being released

Branch `v15-feedback`, on top of `c7e14b9` (version 14), delivered as one Git bundle (`psyalliance-v15.bundle`). It needs version 14 to be in your repository already (it is, as the branch `followup-old-vs-new`).

Because there is no SQL, the order is simply: bring the bundle in, merge, deploy the sandbox, check, push, deploy live, check.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-v15.bundle v15-feedback:v15-feedback
git log --oneline followup-old-vs-new..v15-feedback
```

`git status` will list three changed files (`package.json`, `package-lock.json`, `scripts/deploy-demo.mjs`): these are your Cloudflare flag edits. That is expected. The last command lists only commits whose names start with "Version 15". If it lists anything else, stop and tell me.

## Step 2: merge

If your `master` is still version 13 (`d96a497`), first bring version 14 in, then version 15:

```
git checkout master
git merge --ff-only followup-old-vs-new
git merge --ff-only v15-feedback
```

If `master` is already version 14, only the last line is needed. `--ff-only` stops if anything is out of order; if it does, tell me rather than forcing it. Your three Cloudflare-flag files stay as they are; the merge does not touch them.

## Step 3: sandbox first

Build and deploy the sandbox Worker the way you did for version 14 (`npm run cf:deploy:demo`). Ten-minute check on the sandbox (see below).

## Step 4: live

`git push origin master`, then `npm run cf:deploy`, then the same check on `https://psyalliance.org`.

## The ten-minute check (each site)

- Hub: your greeting is in the bar at the top, then four big coloured areas (Cover, Referrals, Consult, Network / Search), each with a "waiting" count. Below them, three discussions, then Availability and Invite a colleague, both slim.
- Cover: filters All, Active, Completed. Two panels with solid coloured headers ("Colleagues covering your clients", "You covering colleagues’ clients"). Click anywhere on a row to open it. Calendar view shows the plan name or the colleague’s name in each day.
- Referrals: the same filters and colours. "Make a referral" always starts a new one; earlier unfinished ones stay as drafts.
- Cover wizard: the match cards have a larger "Profile" link and a slimmer box. The review step says "How long each colleague has to reply" with a plain sentence under it.
- Network: five colleagues per list with Previous / Next; Suggested shows up to ten, best fit first. "Add as trusted" / "Remove from trusted" and "Message" are real buttons. Search "depression, NY" finds colleagues matching both.
- Message a colleague from the Network: the conversation has a "Back to Network" button.
- Consult: topic chips line up; Ask a question has even spacing; a reply shows "Useful" and a small menu (…) with "Flag this reply". Nothing says "Report".
- Library: PDF templates come first and say "PDF template"; "PDF templates" is a filter; templates have a Download PDF button. **On the live site, templates still read "Coming soon" until you mark each one reviewed (your Library review task). The sandbox shows all 20.**
- Your own profile (click your name at the bottom of the left menu): same layout as a colleague’s, with "Update availability".
- "Watch example" (Demos): arrows are centred in their buttons and clicking a chapter jumps to it.

## Rollback

The site only: Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, choose the previous version, Roll back. About a minute. There is no database change to undo.
