# Release A.1 runbook (design pass after your sandbox review)

> Written 30 Oct 2026 for Nick. **No SQL in this release.** Nothing was pushed or deployed by Claude. Tested on the local staging copy (fictional people only). Release B is on a separate branch and is not in this bundle.

## What it is

Branch `release-a1`, on top of Release A (`release-a`, `5ca2bb9`, which you already deployed to the sandbox). Six commits: "Release A.1 (part 1)" to "(part 6)". Delivered as `psyalliance-release-a1.bundle`, which needs version 14 (`c7e14b9`) in your repository, as the Release A bundle did.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-release-a1.bundle release-a1:release-a1
git log --oneline master..release-a1
```

`git status` will list your three Cloudflare flag files (`package.json`, `package-lock.json`, `scripts/deploy-demo.mjs`). That is expected; the merge does not touch them.

The last command lists what is new to `master`. If Release A is already merged you see **six** lines starting "Release A.1". If Release A is not merged yet you see **eighteen**: four "Version 15" lines, eight "Release A (part" lines and the six A.1 lines. Anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only release-a1
```

If it refuses to fast-forward, do not force it; tell me what `git log --oneline -3 master` shows.

## Step 3: sandbox

No SQL. `npm run cf:deploy:demo`, then the check below on `https://sandbox.psyalliance.org`.

## Step 4: live

`git push origin master`, `npm run cf:deploy`, the check on `https://psyalliance.org`. Still no SQL.

## The five-minute check (each site)

Desktop:
- **Referrals, Refer a client**: Main need and Also sit on one line, and every pair of fields lines up. Same in the Cover client form.
- **Consult, Ask a question**: always a blank question, even if you saved one before. Back on the Consult page your saved questions show as "Saved draft" with Continue draft and Delete draft.
- **Search, Colleagues**: each colleague has a solid avatar in their relationship colour and a label (Trusted colleague, Worked with before, Suggested by PsyAlliance, Verified colleague).
- **Hub**: a search field across the top; the "Know a colleague who would value PsyAlliance?" card has one button; the "You're up to date" bar is green with a tick (or shows the number when there is work).
- **Network**: one panel per relationship, stacked, with a coloured top edge, a count and cards.
- **Cover**: the two lists share one design and line up; today on the calendar is a circle; plan detail columns line up.

Phone (390, then 320): the page title, sentence and main button stack; the Cover pop-up step bar is one slim line; nothing scrolls sideways.

## Rollback

Cloudflare, Workers and Pages, `psyalliance-demo` (and `psyalliance`), Deployments, previous version, Roll back. There is no SQL, so nothing else to undo.

## Not tested here

A real phone; the Cloudflare build and Worker size (your flag edits stay local); screen readers.
