# Acceptance ledger: v9 (Nick, 10 Nov)

Decisions: notifications top-right; agree cover and handover in one step; WhatsApp-style message bar on phones everywhere; "Not for me" on anything that is not a request.

| Point | Change | Checked |
|---|---|---|
| Homepage service colours, gold story link | Eyebrows and "Watch how" links in Cover green, Referrals blue, Consult purple; gold pill button | build |
| /start tiles | Templates line shortened; six equal rows; Just explore centred, smaller | build |
| Hub: remove non-requests | "Not for me" on consult questions sent to you (requests keep Reply/Later) | screenshot |
| Hub: hover full width | Row highlight runs edge to edge of the panel | screenshot |
| Assistant wording, premium, demo | New placeholder; gold border, mark and Ask; new "Ask your PsyAlliance assistant" demo (answers in demos from the sample practice); link from the box | demo check ok |
| Actions bar slimmer | ~2/3 height; "questions you could help with" only when nothing else waits | screenshot |
| Note for colleagues spacing | 22px above | screenshot |
| Library template label | One design everywhere: "PsyAlliance Library template" / "From the PsyAlliance Library"; no review-pending text; Consult guide uses it | screenshot |
| Before you use it | Template-specific note always wins over a generic database note | code |
| Open PDF / Saved | Open PDF opens a tab (inline); Save to My Files becomes "Saved to My Files" | code (no local PDFs) |
| In-card message box | One line, grows to five | screenshot |
| Demos must sell | Messages "failed/retry" chapter replaced by files and voice notes; captions sharpened (network, profile, library, availability); cover demo shows one-step agree | 15 demos pass |
| Notifications position | Top-right under the bell (desktop), under the bar (phone) | screenshot |
| Referral agreed alignment | Grid with fixed person columns; disc and name centred | screenshot |
| Availability header bug | Own profile reads the saved availability (referrals, cover, consult, pause) | code |
| Sandbox activity | 0133_v9.sql: new wording for arrivals | V6-SBX passes |
| Phone: order arrows inside | New row layout | screenshot |
| Phone: Done vs Send | Docked message bar; sheet buttons under ... | screenshot |
| Phone: date picker closes | Sheet size held while a picker is open | needs your iPhone |
| Phone: client list | Folds into numbered discs with a drop-down; sticky save buttons; centred 3-column grid | screenshot |
| Phone: overlapping text in Choose colleagues | Fixed-height scroll panes released on phones | screenshot |
| By colleague 11 of 11 | Counts real fits, sorted by fit | screenshot |
| Phone: client picker | One select replaces the tiles | screenshot |
| Phone: review rows | Rebuilt | screenshot |
| Phone: plan board | Discs fold like the client list | screenshot |
| Cover record on phone | Vertical, centred, arrows down | screenshot |
| Confirm handover typography | Simplified; now mostly bypassed by the one-step agree | screenshot |
| Ask a question box | Full width on desktop; docked on phone | screenshot |
| Calendar day | One plan opens directly | code |
| Consult on phone | Search beside title, two drop-downs, aligned rows, Following badge right | screenshot |
| Messages on phone | Red-dot line removed; clearer context strip; slim bar | screenshot |
| Menu | Availability removed | screenshot |
| Network cards | Role line, full reason, matching pill buttons | screenshot |

Regression (targeted): V6 sandbox 6/6, V7 sandbox 4/4, V15 9/9, follow-up + phone specs 20/20, all 15 demo beat checks.
