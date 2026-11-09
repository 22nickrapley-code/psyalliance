# v7 acceptance ledger

Branch `v7` on `v6`. Local staging only, fictional people. Full suite not run (Nick's instruction); targeted checks below.

| Item | What changed | Evidence |
|---|---|---|
| W1 | AI describe boxes removed from Refer a client and Plan cover (AI stays on the Hub) | V7-SBX-03 asserts no `.ai-box`; screenshot 09 |
| W1b | Import caseload from a spreadsheet (xlsx/csv, read in the browser; need columns kept, names and other columns dropped; missing fields flagged; template) | V7-SBX-03; screenshots 10, 11 |
| W2 | Whole Hub action row opens the request | V7-SBX-01 |
| W3 | Empty Cover column formatted like Referrals | screenshots 08, 25 |
| W4 | Arrival notifications leave after about 12 s (wait on hover) | code review only |
| W5 | Attach (computer, your library, PsyAlliance Library) and voice notes in every card conversation; Show as text (Workers AI Whisper) | V7-SBX-04; screenshots 20-24 (recording and send verified with a fake microphone) |
| W6 | Hub assistant answers from the member's own data; colleagues only from a list ranked by the usual matching rules; cards and open buttons | screenshots 27-28 with the local AI mock (the mock reads the context it is sent) |
| W7 | No Collapse button in Actions | V7-SBX-01 |
| W8 | A declined cover request leaves Active at once | V7-SBX-02; screenshots 25, 26 |
| W9 | Choose colleagues: "Choose colleagues" in red, counts in green | screenshot 14 |
| W10 | Not yet asked greyed; awaiting marked live | CSS; code review |
| W11 | Agreed card: disc centred over the name | CSS |
| W12 | Space between progress line and Needs from you | CSS |
| W13 | Rename a client (pencil, reminder, simple check) | V7-SBX-03; screenshot 12 |
| W14 | Network headers equal height | screenshot 29 |
| W15 | Hub availability as a footer band of each card, one line, status line below | V7-SBX-01; screenshots 01, 02 |
| D1 | Demos rebuilt: desktop-size screen scaled, shield (no clicking or scrolling), words then action then conclusion, arrows go to a step's start, reading a third quicker, "you" not Rachel, seven public demos, chooser step removed, Library tile | every demo's beats pass `?check=1` (14 of 14); filmstrips of overview, time-away, client-referral, caseload, perspective, reducing, library, hub, cover reviewed |
| D2 | No empty band above Return to homepage | screenshot 42 |
| P1 | Doctoral-level only: hero line, strip under the hero, sign-up line | screenshot 40 |

## Not proven here

- Workers AI on Cloudflare (local runs use a stand-in). The first real "Show as text" is the proof.
- The Hub assistant with the real model (local runs use a mock). Try the questions in the runbook.
- Library attachments against live storage (the local copy has no Library files).
- Phone layouts of the new Hub band and import panel (desktop first, as agreed).

## Tests likely to need updating (intended changes, not regressions)

- Anything that looks for `.hub-av-card`, `.hub-av-head`, `.hub-collapse` or the Hub's old availability row.
- Anything that expects the AI box in Refer a client or Plan cover (`[data-ai="referral"]`, `[data-ai="cover-plan"]`, `[data-ai="cover-clients"]`).
- Start page tests that open the "Which describes you best?" dialog (`.guide-dialog`, `data-continue`, `data-skip`).
- Demo tests that expect the Rachel Davis chip in the caption, the 1100 px screen, the overview's Messages chapter, or a step jump to show the step's finished screen.
- Cover filter tests that expect a declined incoming request under Active.
- The demo step text and counts (lengths changed: reading is a third quicker).
