# PsyAlliance v11: acceptance ledger

Nick's 13 Nov desktop notes. Each line says what changed and how it was checked here (local build, desktop 1440 x 900, plus a phone pass where the change also shows on a phone).

| # | Note | What changed | Checked |
|---|------|--------------|---------|
| 1 | Record cover agreed: colleague's name not centred under the disc | Names now centre under their disc on every agreed record (cover and referral), however long the name | Screenshot, desktop and phone; text-align measured as centre |
| 2 | Record cover agreed: "Confirmed 62 days ago" shown twice | Shown once. When it is flagged as a warning, the line below only gives the spaces | Code path checked; line reads "Confirmed 21 days ago · 2 spaces overall" when there is no warning |
| 3 | Record cover agreed: too many font sizes | One scale: names and card lines 14px, client name 15.5px, intro and handover list 14px | Screenshot |
| 4 | Hub: Refer a client, Plan cover and Ask a question not level | The link now sits at the foot of each card, so all three line up whatever the description length | Measured: all three at the same height |
| 5 | Consult discussion header | The category sits beside "Peer consultation", and the question itself is part of the purple header under who asked and when. Replies and the reply box sit below on white | Screenshot, desktop and phone |
| 6 | Network: green Message button too bold | Message is now white, the same as Add to trusted / Remove | Screenshot |
| 7 | Tick-box wording looked bold and off-brand (capacity, reviewed audience, until further notice, prescribing, reviewed requests) | Back to normal body weight in the brand ink colour, as before v10. The tick box stays aligned with the words | Screenshots of the capacity, referral review, cover step 1 and needs boxes; computed weight 400 |
| 8 | Network search cards: name too far from the disc (worse for longer names) | The relationship badge was widening the disc column. It now has its own row, so every name sits 12px from its disc on all tabs | Measured on 9 cards: 12px each |

Also in this release:

- A v10 slip is fixed: on phones, the docked quick-message box (Hub assistant and card conversations) could hide its text box. The fix was made during v10 but missed the v10 commit.
- Sample discussions now say "1 hour ago", not "1 hours ago".

Targeted tests run: network-consult-ui, v15, cover-ui, followup and release-c2 (44 of 45 pass). The one failure, P-01, is an old test expecting "Establish or rebuild a caseload" where the page has said "my caseload" since v7; it is not caused by v11.

Not checked here: Safari on Mac and iPhone.
