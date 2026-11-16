# PsyAlliance v15: 16 Nov phone follow-up

No SQL in this release. Code only.

## What changed
1. Cover plan, Needs from you: Review and Open (conversation) now scroll down to that client, with a short green highlight. With Open, it lands on the colleague's conversation, with Agree cover and Decline underneath. The same happens when you arrive from a Hub action. Picking a client disc still never moves the view.
2. Plan cover, step 1 on a phone: the option cards now stack in a plain column, so each card grows with its words. The Other card no longer spills over its border (a Safari sizing issue).
3. Hub actions on a phone: each action is its own small card. What happened leads in full (never cut off), the client or plan sits underneath, the button runs the width of the card in the service colour, and Later sits beside it. Still two per service with "+N more".

## Deploy (Nick)
1. In PowerShell, in C:\Users\Nick\Documents\psyalliance:
   git fetch C:\Users\Nick\Downloads\psyalliance-v15.bundle v15:v15
   git checkout v15
2. npm run cf:deploy:demo, check sandbox.psyalliance.org on your phone.
3. npm run cf:deploy for live.

## Check on your phone
- Open a cover plan with Needs from you, press Review: the page moves to that client.
- Press Open on a question: it lands on the conversation.
- Plan cover, pick Other: the card holds its words.
- The Hub: open Actions, each item is a card with a full-width button.

## Acceptance ledger
| Item | Result |
|---|---|
| Review in Needs from you scrolls to the client | Pass (Chromium phone size; card lands at the top of the modal) |
| Open lands on the open conversation row | Pass by code path; same scroll |
| Other card does not overflow | Pass in Chromium; the Safari cause is removed by using a column instead of a grid. Check on iPhone. |
| Hub action cards | Pass (screenshot) |
| Desktop Hub | Unchanged |
| Type check | Pass |
