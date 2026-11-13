# Release runbook: v10 (your 12 Nov review, the last round before the road test)

> Written 12 Nov 2026 for Nick. Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project. Built and checked on the local staging copy (fictional people only), on the desktop and at iPhone size.

## What is being released

Branch `v10`. The bundle `psyalliance-v10.bundle` (Downloads) contains v6 to v10, so it works whatever you have merged. **One new SQL file:** `supabase/migrations/0134_v10.sql` (also in Downloads as `psyalliance-v10-0134_v10.sql`). It raises a cover plan's limit to 30 clients and gives new sandboxes better consult discussions. Safe to run more than once. Run any earlier files you have not yet run first (`0132_v6.sql`, `0133_v9.sql`).

## Steps (PowerShell)

1. `cd C:\Users\Nick\Documents\psyalliance`, `git status` (clean), then `git fetch $HOME\Downloads\psyalliance-v10.bundle v10:v10` and `git log --oneline master..v10`. `q` closes a pager.
2. `git checkout master`, then `git merge --ff-only v10`: "Fast-forward".
3. Sandbox project **xsfqeepxnmnvlhxwkfnw**, SQL Editor: any of `0132_v6.sql`, `0133_v9.sql` not yet run, then `0134_v10.sql`. Each: "Success. No rows returned".
4. `npm run cf:deploy:demo`. New sandbox link in Admin, Sandbox (a new link is needed to see the new discussions). Do the checks below.
5. Live project **vvmulsyvyjsxhcpqfpyo**: the same files.
6. `git push origin master`, `npm run cf:deploy`, then the checks on psyalliance.org.

## The checks

Demos (public site)
- Under a demo, Just explore sits in the grid like the other tiles.
- Homepage: "Watch the whole story in 4 minutes" (it really is about 3 minutes 45). The whole story now includes the assistant.
- Consult demo step 2 and the Availability demo: ticking boxes no longer jolts the screen. Availability types "Brooklyn" for New York before saving, and is three quicker steps.
- Library demo: small cards with the save icon in the corner and Overview, View PDF, Download; the overview has Save to My Files.
- The end of every demo says what else your account gives you.

Desktop
- Consult, Ask your colleagues: ticking a colleague never moves them in the list.
- Review your referral: each colleague's considerations on one line (scroll sideways if long). Drag a colleague in "Who is asked, in order": the others shuffle out of the way as you move.
- Messages: speech-bubble tails, the sender's disc on the bubble corner, a small arrow on hover for Copy, Useful, Edit, Remove, Flag. The menu closes when you click elsewhere. One send arrow everywhere.
- Consult discussion: the asker's disc, name, question and context in the purple header; replies below. Reply tools: add a PsyAlliance Library template, or speak your reply (mic).
- A colleague's profile header is tinted by your relationship (trusted blue, worked with purple, suggested teal, others grey).
- Library cards: save icon top-right; Overview, View PDF, Download. View PDF opens a tab; Save turns into "Saved".
- My files: Upload a document and New folder at the top; one row per file with a menu for Open, Move, Delete.
- Settings: no underlined links.
- Cover: the Colleagues tab greys closed requests. Every handover uses one design (the picture, the reminders, Record handover). Agree cover with a colleague who offered records the handover too.
- A member who is not yet verified sees padlocks on View PDF, Download and Save, with an explanation and a link to Verification. The files themselves are refused on the server too.

Phone
- The view no longer jumps: switching who receives a referral, opening a conversation, the Clients/Colleagues/History tabs, asking a question.
- Conversations in cards: the message box is always there at the bottom, including after you ask a question.
- Hub: "Ask anything"; action rows compact (Reply and Later beside the text); service cards equal height; availability line tidier.
- Prescribing tick box beside its words; match cards with tick, disc and name on one line (no rank numbers); review summary discs stay on screen.
- Plan cover: "Other" text inside its box; the pencil sits next to the client name; notifications centred at the very top; up to 30 clients; Choose colleagues uses the same folding row of client discs as Build your client list; the date picker should now stay open on the first tap (please check: I can't run iPhone Safari here).
- Messages: full-screen, compact header; while you type only the person and conversation show; no placeholder; recording bar centred; hold a message for its actions.
- Consult: header higher, discs clear of the green rule, filters fit, placeholders short.

## Rollback

Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back. Database: optional, run `cover_create_plan` from `0130_v4_final.sql` and `demo_discussions()` from `0119_v13_sandbox.sql` again.
