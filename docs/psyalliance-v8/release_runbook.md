# Release runbook: v8 (the phone pass, 9 Nov evening)

> Written 9 Nov 2026 for Nick. Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project. Built and checked on the local staging copy (fictional people only) at iPhone size (393 x 852). As agreed, the full regression suite was not run: only what changed was tested.

## What is being released

Branch `v8`, on top of `v7`. One Git bundle, `psyalliance-v8.bundle`, in Downloads. It contains v6, v7 and v8, so it works whether or not v7 is already merged. **There is no new SQL in v8.** The only SQL still outstanding is v6's `0132_v6.sql`, if you have not run it yet.

## Steps (PowerShell)

1. `cd C:\Users\Nick\Documents\psyalliance`, then `git status` (clean), then
   `git fetch $HOME\Downloads\psyalliance-v8.bundle v8:v8` and `git log --oneline master..v8`.
   You will see v8 at the top, with v7 and v6 under it if they are not merged yet. Press `q` if a pager opens.
2. `git checkout master`, then `git merge --ff-only v8`. It should say "Fast-forward".
3. Only if `0132_v6.sql` has not been run: run it in the Supabase SQL Editor on the sandbox (**xsfqeepxnmnvlhxwkfnw**). Expect "Success. No rows returned".
4. `npm run cf:deploy:demo`. Make a new sandbox link in Admin, Sandbox, and do the phone check below on your iPhone.
5. Only if needed: `0132_v6.sql` on live (**vvmulsyvyjsxhcpqfpyo**).
6. `git push origin master`, then `npm run cf:deploy`, then the phone check on psyalliance.org.

## The phone check (iPhone, Safari)

- **Top bar.** Menu and logo left; Sandbox, Search and the bell as three matching square buttons right.
- **Hub.** One slim line, "Watch the 60-second demo" with "Hide demos". The Ask box is one row: "Ask PsyAlliance anything", mic, Ask.
- **Every pop-up** fills the screen, with the X top-right and the main button along the bottom. Where there are more actions, they are under **More** (for example on a sent referral: Done, and More holds Use as a starting point, Withdraw, Change details, Add recipients).
- **Boxes.** Tapping any box no longer zooms the page. The text in every box, and the grey example text, is the same size everywhere; labels sit above it.
- **Refer a client, Review.** Who is asked, in order: small arrows on the right, names on one line. Below: one card with the reply time, when the client hopes to start and the private title.
- **Plan cover.** "Import your caseload" is one line with Choose a file; the arrow opens the explanation and the template. States: a neat two-column checklist, box beside the name. Client details: labels and titles in one hierarchy.
- **A cover plan you sent.** Press Conversation on a colleague: a full-width box, then paperclip, mic and Send underneath. Nothing runs off the screen.
- **A colleague's profile.** X top-right; "Worked with before" is two short lines and the button.
- **Your profile.** Every pencil opens a full-screen card that works (About, Contact details, Insurance, Approaches...). Fill in from a link: the found photo sits in its own box with "Leave this photo out"; the result reads as a status line.
- **Homepage.** No green "Doctoral-level only" strip. Under the bar, a row of quick links (Cover, Referrals, Consult, Library, Trust, Questions). Career stages, Library templates and Trust are swipeable cards. Much less scrolling.

## Rollback

Cloudflare, Workers and Pages, `psyalliance` (or `psyalliance-demo`), Deployments, previous version, Roll back. Nothing in the database changed.
