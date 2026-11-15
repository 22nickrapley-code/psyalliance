# PsyAlliance v12: acceptance ledger

Covers the release QA review (13 and 14 Nov) and the v11 desktop tweaks. Everything was checked on a local build: desktop, plus phone where the change shows on a phone. The QA reviewer tested the live site, which may have been running an older version.

## Fixed

| QA | What was wrong | What changed | How it was checked |
|---|---|---|---|
| C7 | Saving a guide to My Files said "Only Library templates can be saved" | The six guides save a copy of their PDF to My Files, in the PsyAlliance documents folder | Saved a guide as a verified member: toast shown, copy in My Files, 59 KB PDF stored |
| M15 | Opening a cover notification left the Cover page unresponsive until refresh | A leftover closing timer was wiping the plan window just after it opened. The plan now opens and the page responds | Reproduced first (page frozen, no window), then fixed: the plan window opens; Calendar and the checklist respond |
| M8 | A tab left open after someone else signs in on the same browser still showed, and could act for, the previous member | The server refuses any action from a page opened for a different member, and the page reloads as whoever is signed in now. It also checks when you come back to the tab | Opened as Avery, then signed in as Fenn on the same browser: the old tab reloaded as Fenn |
| C3 | Nobody had proven members can't read each other's private work | New test suite `access-isolation.spec.ts`. A member not involved, and a signed-out caller, try to read and change another member's cover plan, referral, private question, messages, files, continuity plan, notifications and drafts. It also checks that sandbox visitors never appear to live members | 6 of 6 pass. A check that the involved colleague *can* see the work proves the tests aren't empty. The signed-out sweep covers every public table |
| S3 | An empty backup table could be read and written by anyone | Closed to members and visitors (0135) | Locally: RLS on, no grants. The anonymous API now refuses it |
| C1 | Copy still said "confirm each handover"; the demo plan showed a separate Confirm handover task; history said "Handover is still to be confirmed" | Copy says agreeing cover records the handover. The demo plan's Client 2 is ready. The history wording is fixed (0135) | Demo checks pass; screenshots |
| C5 | The Terms said founding places go in order of approval; your v4 rule gives them on activation | Terms now say the first 40 to activate, once their license there is approved, are founding members | Read against the activation function |
| M7 | A colleague at capacity (0 spaces) was pre-selected for a referral; the network tile counted every member | At-capacity colleagues are no longer pre-selected (still listed and still choosable). The tile counts only members who can take the client | Your decision of 14 Nov. Demo checks pass |
| M12 | The assistant and the import message said 20 clients; the limit is 30 | Both say 30, and the assistant's caseload reader takes 30 | Code |
| M13 | A plan cancelled before it began still counted as "worked with before"; its progress line said "Covering" | Cancelling before the start removes the record, and older cases are tidied (0135). The screens also ignore such a plan, and its progress line says "Plan cancelled" | Database test: record removed on cancel |
| M1 | "Release QA" refused as client initials | Common abbreviations allowed, on screen and in the database. "JD" is still refused | Database check |
| M4 | The assistant couldn't say which cover requests went out today | It now knows when each plan was sent and who each client was asked of. It also knows when each discussion was asked | Code only: the real AI isn't available here |
| M3 | "Richmond, VT, VT" | A city saved with its state shows the state once | Code |
| M6 | "1 clients", "1 colleagues" | Singular forms | Code |
| M9 | Old notifications started "responded 'interested'…" with no name | Read "A colleague can accept your referral request" | Code |
| M11 | Saving an empty backup said "Your backup saved" | Says it was saved but no backup is named yet | Code |
| M5 (labels) | "Watch the two-minute demo" on the sandbox, sign-up and start pages | Shows the real length, worked out from the demo itself | Build |
| C4 | The Hub demo prompt squeezed into a column when the window narrowed | It wraps, and the Hub redraws when the screen crosses phone width | Code; the phone layout was already short |

## Not changed (needs your decision, or goes against an earlier one)

- C2 founder story: your decision is pending.
- C6 Library "Coming soon": left as is (your decision, 14 Nov).
- C1 Handover step in the progress line: kept. It ticks at the same moment as agreement.
- M2, and M5's outcome chapter: kept as approved in v10.
- S1, a full browser content policy: recommended as a separate task after the road test.
- S4, package advisories: build-time only, in Next.js's own dependency. Wait for the next Next.js update.
- S2: known limit; the app already warns clinicians.

## For you (account data)

- Rena's main practice state is Texas, but her approved licenses are MA and NY. That's why her Hub offers Texas activation.
- Rena's bio mentions Texas and Oregon.
- The Rachel test account signs in as nick@nickrapley.com.

## Could not reproduce

- M16: Messages tabs matched their content in every combination tried (general, referral and cover threads, in both directions).

## Test runs

- Targeted suites: cover, cover-ui, referrals, referrals-ui, messages-ui, v15, network-consult-ui, followup, release-a, release-b-save, account-pages, plus the new access-isolation suite. The demo checks for refer, client-referral, cover and overview also pass.
- The new access suite passes 6 of 6.
- Five older tests fail on v11 *and* v12, so v12 didn't cause them:
  - CV-02 and MSU-01 count whole tables, and the local copy holds sandbox data.
  - RFU-03 expects old toast wording.
  - RA-03 expects an old action count.
  - PB-01 expects a restore toast.
- Account-pages A11Y failed once in the v12 run, then passed on re-run, so it looks like timing rather than a real fault.
