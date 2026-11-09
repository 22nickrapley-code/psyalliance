# Release runbook: v7 (your second 9 Nov walkthrough)

> Written 9 Nov 2026 for Nick. **Nothing has been pushed or deployed by Claude, and nothing has been run on either Supabase project.** Everything was built and checked on the local staging copy (fictional people only). As you asked, the full regression suite was **not** run: that is for the reviewing LLM.

## What is being released

Branch `v7`, on top of `v6`. One Git bundle, `psyalliance-v7.bundle`, in your Downloads folder.

**There is no SQL this time.** Nothing changes in either database.

**One Cloudflare change:** `wrangler.jsonc` now asks for Workers AI (the `"ai": { "binding": "AI" }` lines, for both the live site and the sandbox). It is used only for "Show as text" on voice notes. Workers AI is on every Cloudflare account; the deploy command adds the binding by itself. If the deploy ever complains about it, delete those two lines, deploy, and tell me: everything else works without it, and "Show as text" just says it isn't switched on yet.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch $HOME/Downloads/psyalliance-v7.bundle v7:v7
git log --oneline master..v7
```

`git status` should say the working tree is clean. The last command lists the v7 commit (and v6 too, if v6 isn't merged yet). If it lists anything else, stop and tell me. Press `q` if a pager opens.

## Step 2: merge

```
git checkout master
git merge --ff-only v7
```

It should say "Fast-forward".

## Step 3: deploy the sandbox

If you haven't run v6's SQL (`0132_v6.sql`) on the sandbox yet, do that first (v6 runbook, step 3). Then `npm run cf:deploy:demo`, make a **new** sandbox link in Admin, Sandbox, and do the check below.

## Step 4: live

If v6's SQL isn't on live yet, run it first (v6 runbook, step 5). Then `git push origin master` and `npm run cf:deploy`, and do the check on live.

## The check

- **Hub.** Under each of Referrals, Cover and Consult, a tinted band with that service's availability buttons on one line. Under the three cards, one line: Your availability, when you last confirmed it, spaces, Full settings. Open Actions: no Collapse button; click anywhere on a row and the request opens.
- **Notifications** (sandbox arrivals, bottom right) leave by themselves after about 12 seconds; hovering keeps one up.
- **Cover page.** With no plans of your own, the left column looks like the Referrals one (title, description, line, centred note). Say Not available to a colleague's request: it leaves Active at once and is under Completed.
- **Plan cover.** No AI box. At the top, "Import your caseload from a spreadsheet". Download the template, fill in two rows, add a Name column, import it: needs come in as Client 1, 2; the note says the name column was left out; anything missing (a state, a main need) is marked in red and Continue won't go on until it's filled. Open a client and use the pencil to rename it (with the reminder about identifying details).
- **Choose colleagues.** A client with nobody chosen says "Choose colleagues" in red; the others say "2 selected" in green, and the count changes as you tick.
- **A plan of yours, a client's replies.** Awaiting reply is marked as the live one; "Not yet asked" colleagues are greyed.
- **Record cover agreed.** The colleague's disc sits centred over their name. **Needs from you** has room under the progress line.
- **Network.** The three column headers are the same height, so the lists start level.
- **Conversations inside a card** (cover, referral): a paperclip (your computer, your library, the PsyAlliance Library) and a microphone, as in Messages. A sent voice note has **Show as text**.
- **Ask PsyAlliance** (Hub, when AI is on): try "Who have I worked with most?", "Who do I message most?", "My cover plans next month", "Top 3 in Massachusetts who see adults remotely". Colleagues come back as cards with Message; places come back as buttons that open them.
- **Demos.** In the app ("Need a demo?") and on the public site (/tour, /start): the screen is the full desktop product, scaled; you can't click or scroll it; the words come first and the screen then does exactly that; the arrows take you to the start of a step; no "Rachel Davis" anywhere in the captions. /start goes straight to a demo (no "Which describes you best?") and has a Library tile. /tour has no empty band above Return to homepage.
- **Homepage.** The lead says every member is a doctoral-level psychologist or psychiatrist; a green strip under the hero: Doctoral-level only, PhD, PsyD, EdD, MD, DO. Sign-up's first line names the degrees.

## Rollback

- **The site:** Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back.
- **Database:** nothing to roll back.
