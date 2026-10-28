# Version 15: release notes

Branch `v15-feedback` on top of `c7e14b9` (version 14). Written 28 Oct 2026. Nothing was pushed, deployed or run on either Supabase project. **There is no database change in version 15** (no migration, no SQL). The runbook is `release_runbook.md`.

## What changed, against your 16 screenshots

| Your note | What it is now |
| --- | --- |
| Demo player: arrows, jumping between chapters | Arrow buttons are drawn centred. Clicking a chapter jumps straight to it and shows that chapter's screen. Each beat waits a readable time before it starts. |
| Cover and referral colleague cards | Green "good fit" bubbles kept. "Profile" is bigger and sits in the top row with the tick box; the box under it is slimmer (the footer only appears when there is an availability note). |
| Cover review deadline wording | "How long each colleague has to reply", with a sentence that matches the order you chose (one after another, or all at once) and what happens if nobody answers. Checked against what the system actually does: only an unanswered request expires; one you are discussing stays open. |
| Search by several things | Commas: "depression, NY" needs both. Works in Find colleagues and the Network search. Short terms (like NY) match whole words only. |
| Network buttons and paging | Five per list with Previous and Next. Suggested is ranked best fit first and shows up to ten. "Add as trusted / Remove from trusted" and "Message" are real buttons on the same row, same size. "View all" removed. |
| Message back button | A conversation opened from the Network (or Hub, Cover, Referrals, Consult, Library, search) has a "Back to ..." button that returns to where you were. |
| Library PDFs | PDF templates now come first, are tagged "PDF template", have a "PDF templates" filter and a Download PDF button. See the Library note below. |
| Hub | Greeting moved into the top bar (still a heading for screen readers; shown big on a phone). Removed "2026 on PsyAlliance", "7 actions waiting" and the duplicate date. Three discussions. Four large coloured areas (Cover, Referrals, Consult, Network / Search), each with a "N waiting" count. Availability, invite and colleagues are slim. |
| Stronger colours | Each area has its own colour and tinted page. Your plans are blue, colleagues’ plans are terracotta. Active rows are coloured, completed rows grey. Status labels are solid and bold. |
| Cover list | Panel titles "Colleagues covering your clients" and "You covering colleagues’ clients" with a "When you’re away" / "When a colleague is away" line. No "Open plan" buttons: the whole row opens. Bigger text. |
| Filters | Cover and Referrals both use All, Active, Completed. |
| Several referral drafts | "Make a referral" always starts a new one. Unfinished ones stay as drafts, each with Open and Delete. Same for Cover. Drafts are kept in the existing drafts table; no SQL. |
| Consult | Topic chips line up. The Ask-a-question window has even spacing. "Useful" is a pill; "Report" is now "Flag" and lives in a small menu on each reply (also on discussions, profiles and messages). |
| Your own profile | Same layout as a colleague’s: availability, licences and settings at a glance, what colleagues can see, and an Update availability button. |
| Calendar | Each day shows the plan name for your own plans, or the colleague’s name with the plan name under it, for plans where you cover someone. The key explains the two colours. |

## Smaller or different from what you might expect

- **Library on the live site.** Templates read "Coming soon" there until you mark each one reviewed (your Library review task). The sandbox shows all 20 with their PDFs. Version 15 only changes where they sit and how they are found.
- **The Hub greeting is in the top bar on desktop** and a big heading on a phone. If you would rather it stayed big on desktop too, it is one line of CSS.
- Trusted colleagues: the Network now pages five at a time; nobody is hidden.
- Suggested ranking is done in the browser from the order the server already gives (no database change), capped at ten.

## What I tested, and what I could not

Local staging copy, fictional people only, 28 Oct 2026, from a production build of this branch.

- **Workspace suite (190 tests):** 163 pass, 23 skipped by design, 1 failed once in the full run (FU-03, flag a profile, then block) and passes on every rerun (14 of 14, including 10 in a row). Includes 9 new checks in `e2e/tests/staging/v13/v15.spec.ts` (V15-01 to V15-09) and a new demo-player check (DEMO-V15-01).
- **Older suites (599 tests):** 590 pass, 3 skipped, 6 fail: the `/sandbox/request` checks, which need the real website and fail the same way on every offline run (as in version 14).
- **Phone 2 of 2, public 14 of 14.**
- **Every demo:** the beat-by-beat check that each scripted step finds its control on the real screen passes on desktop and phone for all nine demos.
- **Contrast:** a first full run found 19 small-text colours just under the 4.5:1 line on the new tinted backgrounds (caption greys, step labels, the gold and green status pills, date numbers). All darkened and rechecked with the accessibility checker on the real screens, desktop and phone. A sweep that opens a sample of every pop-up on every page found four more (pager text, empty-list text, a Library note), fixed.
- **Test-side fixes made along the way** (no product change): Network paging test now makes a sixth member visible for its own run; two resilience tests (RV-05, RV-09) now look for the tick on their own message instead of the last tick in the conversation; the two Hub heading checks accept the new greeting.

Not testable here: the Cloudflare build and Worker size (still needs your `--dangerouslyUseUnsupportedNextVersion` flag, which stays in your local files), a real phone, keyboard-only and screen-reader passes, real email.

## What I would watch

- The Hub on a phone: the four area cards sit two across; check they feel right with your thumb.
- Row colours: the blue (your plans) and terracotta (colleagues’ plans) are strong on purpose; say if they are too much.
- Cover and Referral rows on a very narrow phone: the status pill now sits on its own line under the title.
