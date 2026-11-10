# Release runbook: v9 (your 10 Nov review)

> Written 10 Nov 2026 for Nick. Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project. Built and checked on the local staging copy (fictional people only), on the desktop and at iPhone size. Only what changed was tested.

## What is being released

Branch `v9`. The bundle `psyalliance-v9.bundle` (Downloads) contains v6, v7, v8 and v9, so it works whatever you have merged. **One new SQL file:** `supabase/migrations/0133_v9.sql` (also in Downloads as `psyalliance-v9-0133_v9.sql`). It only rewrites the words of the sandbox's arrivals, it only does anything on the sandbox, and it is safe to run more than once. If you have not yet run `0132_v6.sql`, run that first.

## Steps (PowerShell)

1. `cd C:\Users\Nick\Documents\psyalliance`, `git status` (clean), then
   `git fetch $HOME\Downloads\psyalliance-v9.bundle v9:v9` and `git log --oneline master..v9` (v9 at the top; any of v8, v7, v6 not yet merged underneath). `q` closes a pager.
2. `git checkout master`, then `git merge --ff-only v9`: "Fast-forward".
3. Sandbox project **xsfqeepxnmnvlhxwkfnw**, SQL Editor: `0132_v6.sql` if not yet run, then `0133_v9.sql`. Each: "Success. No rows returned".
4. `npm run cf:deploy:demo`. New sandbox link in Admin, Sandbox. Do the checks below.
5. Live project **vvmulsyvyjsxhcpqfpyo**: the same two files (on live, 0133 changes nothing; running it keeps the two databases identical).
6. `git push origin master`, `npm run cf:deploy`, then the checks on psyalliance.org.

## The checks

Desktop
- **Homepage.** "Cover", "Referrals", "Consult" in their own colours; "Watch the whole story in two minutes" is a gold button.
- **/start.** Six tiles the same size; Just explore smaller, centred beneath.
- **Hub.** Hovering an action fills the whole row. A question sent to you has "Not for me" beside Later. The actions bar is slimmer and only says what needs you. The gold Ask box reads "Ask your PsyAlliance assistant anything...", with "See what it can do" (the new assistant demo).
- **Notifications** appear top-right, under the bell.
- **Refer a client, Review.** Space above "Note for colleagues". The template at the bottom reads "PsyAlliance Library template", no "review pending". View, then Open PDF opens a tab; Save to My Files turns into "Saved to My Files".
- **Conversations in cards:** a one-line box that grows as you type.
- **Record referral / cover agreed:** each disc and name centred on one line. Agree cover now records the handover too, with a short reminder list.
- **Your profile as colleagues see it:** after changing availability, the header and Current availability match.
- **Network:** tidier cards with two matching buttons.

Phone
- Who is asked, in order: number top-left, disc under it, name in full, small arrows inside.
- Open a conversation in a card: the message bar sits at the bottom of the screen like WhatsApp; Done is gone while you write (under the ... button). Same for Ask a question and Consult replies.
- Plan cover: the date picker stays open on the first tap. With many clients, they fold into one row of numbered discs; Save client / Save & add another stay visible. Choose colleagues: one Client picker. By colleague: "Fits 6 of 11 clients", not 11 of 11. The plan's client list folds the same way.
- Cover calendar: a day with one plan opens it directly.
- Consult: search beside the title, two drop-downs, then the discussions.
- Messages: no red-dot explanation; a clear "About a cover plan / Open plan" strip; slim bar.
- Menu: no Availability.

Sandbox
- The arrivals read as real, interesting work: a client moving out of state, late cancellations, a trauma referral from someone who trusts you.

## Rollback

Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back. Database: run the `sandbox_story_event` definition from `0132_v6.sql` again (sandbox only; optional).
