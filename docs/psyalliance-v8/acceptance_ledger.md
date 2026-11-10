# Acceptance ledger: v8 (phone pass)

Each item from Nick's 9 Nov phone review, what changed, and how it was checked (local staging, Chromium at 393 x 852 with touch; Safari itself is not available here, so Safari-specific rules were added defensively and need Nick's iPhone check).

| # | Nick's point | What changed | Checked |
|---|---|---|---|
| 1 | Top bar messy | Sandbox, Search and bell are three matching 40px icon buttons; logo smaller; avatar hidden on phones | Screenshot, Hub and account pages |
| 2 | Demo prompt doesn't fit | One slim line on phones: "Watch the 60-second demo" and "Hide demos" | Screenshot, every section |
| 3 | Ask box too big, text cut off | One row; "Ask PsyAlliance anything" on phones | Screenshot (AI on locally) |
| 4 | Referral box text too large vs labels | 16px in every box and placeholder (stops iPhone zoom), labels 14px bold, titles 21px; same rules on public pages | Audit: no box under 16px on any workspace, account or public page |
| 5 | Profile X in the wrong place | X absolute top-right on every pop-up; header tighter | Screenshot |
| 6 | Worked with before too long | Two short lines and the button | Screenshot |
| 7 | Order arrows take a third of the row | 34px stacked arrows; drag handle hidden on phones; names never break mid-word | Screenshot, referral and cover review |
| 8 | Reply time, timeframe, private title badly laid out | One settings card (all widths): label and short help, control beside (desktop) or below (phone) | Screenshots phone and desktop; V15-01 updated to new wording |
| 9 | Footer bar after sending looks awful | Phones: main action + Back + More menu holding the rest | Screenshots: sent referral, sent plan, needs step, profiles |
| 10 | Import box takes 60% of the screen | Slim row (title, Choose a file, arrow); explanation and template behind the arrow (all widths) | Screenshots phone and desktop; caseload demo passes |
| 11 | Date and plan name fonts differ | Same 16px everywhere; dates left-aligned | Audit |
| 12 | States checklist misaligned, wasted space | Two columns, box beside name, 40px rows, scrolls inside | Screenshot |
| 13 | Client details fonts inconsistent | One hierarchy: eyebrow, 18px client title, 14px labels, 16px boxes; Setting full width | Screenshot |
| 14 | Cover order boxes too narrow | Same row design as referrals; meta text takes the full width | Screenshot |
| 15 | Card conversation: tiny box, Send off screen | Full-width box, then attach, mic, Send; responses wrap; names whole | Screenshot |
| 16 | Client card half off screen | Card and its children constrained to the sheet width | Overflow audit: nothing wider than the screen |
| 17 | Homepage too long, no quick buttons, strip duplicated | Strip removed; sticky quick links; short hero on phones; stages, library and trust swipe; "without" column hidden on phones | Screenshot |
| 18 | Profile import result badly formatted | Photo in its own box with note and choice; status line | Screenshot |
| 19 | Profile edit cards broken | Safari collapsed the card body (flex-basis); fixed for all widths; full-screen sheets on phones | Screenshots of three cards |
| 20 | Everything premium | Full-screen sheets everywhere, notifications open without the keyboard, search fields unified, text-size-adjust fixed | Every page captured and reviewed |

Regression run (targeted): phone P13-01/02, V6 sandbox (6), V7 sandbox (4), V15 (9), all 14 demo beat checks: all pass.
