# Release A.1: design pass after your sandbox review

Written 30 Oct 2026 for Nick. Branch `release-a1`, on top of Release A (`release-a`). **No SQL. Nothing pushed or deployed by Claude.** Tested on the local staging copy (fictional people only).

## What you reported, and what is different now

| You said | What I found | What it is now |
| --- | --- | --- |
| Make a referral: formatting and design need tweaking | A spacing rule I added in Release A pushed the second field of every two-column row 18px lower (Main need / Also, and the same in Cover's client form and other pop-ups). My bug. | The grid alone spaces fields. Every pair sits on one line, rows are evenly spaced, the form is shorter. Fixed for every pop-up that uses two columns. |
| Clicking Consult goes into an existing question rather than starting a new one | Consult kept one saved draft, opened it every time you pressed Ask a question, and the Consult page never showed it. So you could not start a new question or even see the old one. Cover and Referrals already worked the other way. | Ask a question always starts a blank question. Saved questions appear on the Consult page as "Saved draft" with **Continue draft** and **Delete draft**, the same as Cover and Referrals, and you can keep several. A question you had saved before is kept and shows up there. A blank pop-up is not saved as a draft any more. |
| In Search, colleagues need the relationship colour | Search showed a plain icon for everyone. | Each colleague has a solid avatar in their relationship colour and a label: Trusted colleague, Worked with before, Suggested by PsyAlliance, Verified colleague. The same solid avatars now appear on Network and everywhere a colleague avatar is shown. |
| The "know a colleague" design | A plain line of text and a small button. | A card: icon, "Know a colleague who would value PsyAlliance?", "Copy a short invitation to share with them.", one button. Nothing is sent from it. |
| Search needs to be more prominent, perhaps part of the dash | A small text link in the top bar. | A search field across the top of the Hub ("Search PsyAlliance", with the shortcut), and the top bar's Search is now a proper field on desktop. Both open the same Search window. I kept Search in the top bar as the brief says; the Hub field is an addition. |
| The "You're up to date" bar | A plain white strip. | A green status bar with a tick: "You're up to date. Nothing is waiting on you right now." When there is work, the bar shows the number in a dark disc, "10 things need your attention". |
| Network page not good enough | Three narrow columns with different starting heights, an avatar touching the column edge, heavy header boxes, and mostly empty columns. | One panel per relationship, stacked, each with a coloured top edge, a one-line description, a count, and a grid of colleague cards with room around them. The three-line tier list at the top no longer repeats each description. |
| Cover needs a fine tooth comb | The two lists had headers of different heights so rows never lined up; three different card styles (coloured left bar, flat, no border); tinted header blocks with icon tiles; chevrons in circles; the calendar's "today" was a stretched oval; panels inside panels; "1 invitations and responses"; plan detail column headings out of line with their columns; small status chips; the footer note was a second card. | Both lists share one design: white panel, plain header, hairline-separated rows, the same row whatever the status (the pill and the words say the status), headers line up row for row. Today is a circle. The calendar's lower section is flat. Plan detail columns line up and chips are 12px. "1 invitation or response". The footer note is a quiet line. Referrals use the same list design. |
| Phone | Page title, sentence and main button were squeezed side by side. | They stack; the main button is full width. The welcome strip wraps cleanly. |

## Things I changed that you did not ask for

- **Avatars are solid colour everywhere**, not only in Search, so the colours mean the same on every page.
- **Consult drafts are a list** (like Cover and Referrals), not one slot. This is how the Consult bug was fixed properly: there is no way to overwrite your earlier question by starting a new one.
- **Hub search field above the verified strip and the action bar**, so it never moves when the strip is closed.
- **The sandbox Hub demo** now points at the invite card (its last step still looked for the old line; the full regression caught it).

## What I did not change

Matching, eligibility, outreach, scheduling, messages, availability, permissions, the Library. No route, no stored record, no SQL. Saved Consult questions are converted when the page loads (the old slot is emptied on the next save).

## Evidence

Ten new checks (`release-a1.spec.ts`, A1-01 to A1-10, the last ones at 390 and 320 wide), all passing on the final build:

| Check | What it proves |
| --- | --- |
| A1-01 | Paired fields in the referral form share a top edge and rows have equal pitch. |
| A1-02 | Ask a question starts blank even when a draft exists; the draft is on the Consult page; Continue restores it; Delete removes only it. |
| A1-03 | A question saved by the old single-slot version appears in the list and opens. |
| A1-04 | Every colleague in Search has an avatar and a label of the same relationship. |
| A1-05 | The Hub has a search field; it opens Search. |
| A1-06 | "You're up to date" is its own bar; the invite card has one button, not stretched. |
| A1-07 | Cover's two lists start their rows on the same line; no coloured left bars. |
| A1-08 | Network groups are stacked; cards sit inside their panel; avatars carry the colour; the tier description is in the header. |
| A1-09 | Nothing scrolls sideways at 390 and 320 on Hub, Cover, Network, Referrals, Consult or the referral pop-up. |
| A1-10 | Cover pop-up on a phone: the step bar is one slim line, the Profile link sits under the colleague name, one invitation reads "1 invitation goes out first", the reply field is full width. |

The regression results are in `acceptance_ledger_a1.md`.

## Not tested here

A real phone; the Cloudflare build and Worker size (your `--dangerouslyUseUnsupportedNextVersion` edits stay local); screen readers.

## If you want something different

Everything above is in two files: `public/workspace/restrained.css` (the last block, "Design pass") and `src/workspace/engine.ts`. Rolling back is a Cloudflare rollback to the previous deployment.
