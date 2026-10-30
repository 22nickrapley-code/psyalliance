# Release A.1: acceptance ledger

Written 30 Oct 2026 for Nick. Build: branch `release-a1`, tip "Release A.1 (part 4)", built for production and run on the **local staging copy** (fictional people only; no live or sandbox data was changed). Nothing was deployed. No SQL.

## What was checked

| Item you reported | Result | Evidence |
| --- | --- | --- |
| Referral form formatting | **Pass** | A1-01 (Auto): paired fields share a top edge, rows have equal pitch. A1-09: nothing scrolls sideways at 390 and 320. |
| Consult starts a new question | **Pass** | A1-02: Ask a question is always blank, saved drafts are listed with Continue and Delete, Delete removes only that one. A1-03: a draft from the old single slot appears and opens. |
| Relationship colours in Search | **Pass** | A1-04: every colleague has an avatar and a label of the same relationship. |
| "Know a colleague" card | **Pass** | A1-06: one button, not stretched. |
| Search prominence | **Pass** | A1-05: Hub search field opens Search. |
| "You're up to date" bar | **Pass** | A1-06: its own bar. |
| Network page | **Pass** | A1-08: stacked panels, cards inside their panel, coloured avatars, description in the header. |
| Cover fine-tooth comb | **Pass** | A1-07: both lists start rows on the same line, no coloured left bars. A1-10: phone Cover pop-up (step bar under 64 px, Profile link below the name, one-invitation grammar, full-width reply field). |
| Phone | **Pass** | A1-09 and A1-10 at 390 and 320. |

Visual checks were also made by looking at screenshots at 1365, 390 and 320 wide for Hub, Cover (list, calendar, pop-up steps 1 to 4), Network, Search, Referral and Consult pop-ups.

## Full regression

The whole staging suite (816 tests) was run on the A.1 build. **774 passed, 26 skipped, 5 did not run, 11 failed.** The 11 failures, one by one:

| Failure | Cause | Now |
| --- | --- | --- |
| 6 × `RT /sandbox/request` | These pages need to call a service outside this workspace, which has no outside access. They fail the same way on Release A and version 15. | Not a product fault; not re-run here. Please look at `/sandbox/request` on the sandbox. |
| 2 × DEMO-V14-01 (desktop, phone) | **A real A.1 bug.** The sandbox Hub demo's last beat points at the old "invite a colleague" line, which A.1 replaced with a card, so the demo step could not find its target. | Fixed in A.1 part 4 (the demo now points at the card and its caption says "card"). Re-run on the final build: pass. |
| AUTH-02-B, AUTH-03-A | The test accounts' email links send the browser back to the site on port 3600; I had served the build on 3640. Not a product fault. | Re-run with the build on 3600: pass. |
| V15-04 | The known occasional timing flake ("Back to Network", about 1 run in 8). | Re-run: pass. |

After the fix, the re-run of the 27 affected tests: **27 passed**. The A.1 spec (A1-01 to A1-10, desktop and phone) on the final build: **11 passed**.

## Not tested here

A real phone; the Cloudflare build and Worker size; screen readers; the six `/sandbox/request` pages (outside access).

## Rollback

Cloudflare: previous deployment. No SQL.
