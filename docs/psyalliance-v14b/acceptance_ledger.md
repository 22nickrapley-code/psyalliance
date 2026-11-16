# PsyAlliance v14: acceptance ledger

Nick's 16 Nov phone review. Everything was checked on a local build at iPhone size (393 x 852), except where noted.

| # | Note | What changed | How it was checked |
|---|---|---|---|
| 1 | Ask box: the star isn't centred | On one line, the star, clear, mic and Ask all sit in the middle of the box | Screenshot |
| 2 | Match cards: badge in the middle | On a phone the Verified, Trusted or Worked-with-before badge sits under the name, left-aligned with it | Screenshot |
| 3 | Cover: "Ask a question" didn't open the conversation | Asking opens the conversation straight away: the request and earlier messages show above, with "Your question goes into this conversation". Referrals work the same way | Phone test: the conversation shows while typing |
| 4 | "Needs your reply" when you spoke last | A cover request where you asked a question and spoke last now says "Waiting for reply", with "Next: Wait for Eli to answer your question" | Code; the rule is "who sent the last message" |
| 5 | Date box drops the form halfway down the screen | Tapping a date box while the keyboard is up now closes the keyboard first. The form settles at full height, then the date picker opens | Code only. **Check on your iPhone:** Plan cover, Other, type the context, then tap From |
| 6 | "Next client" hidden under More | The bottom bar shows an arrow-only Back, "Next client" and "Review" (it becomes "Review invitations" on the last client) | Phone test: the bar reads "Back, Next client, Review" |
| 7 | Hub actions list too long and not coloured | On a phone each group is coloured (blue referrals, green cover, purple consult) and each item is one line with its button. Each group shows two items, then "+N more". "Questions you could help with" folds into one line | Phone screenshot: four actions fit on one screen |
| 8 | Consult: the reply box hidden behind the keyboard | While the keyboard is up, the header shrinks to the title and two lines of the question, so the reply box stays in view | Phone screenshot with a short screen. **Check on your iPhone** |
| 9 | Consult "Following" | Now "Mine & following" on phone and desktop, and always includes your own questions | Screenshot; FU-04 test updated and passing |
| 10 | A profile's license line cut off | Each chip in a profile header scrolls sideways if it's too long | Screenshot |
| 11 | Network card buttons | On a phone the two buttons sit side by side, centred on the bottom line of every card | Screenshot |
| 12 | Search box placeholder cut off | Reads "Search by name, specialty or state" on a phone | Code |
| 13 | Back to the profile after Refer a client | Closing a referral (or cover plan) started from a profile returns to that profile; closing again returns to where you were before | Test: profile, referral, X, back on the profile |
| 14 | Library: saved folder | Once a resource is saved, its folder icon turns PsyAlliance green | Code |
| 15 | Notices inconsistent; swipe away | A colleague arriving shows as the same small green notice as everything else. Any notice can be swiped away sideways. The white "Just arrived" card on the account pages is gone, so arrivals happen only in the workspace, where the "three things waiting" hold applies | Code; swipe works with touch or mouse. **Check on your iPhone** |
| 16 | "Most conversations" | Now "Most messages" (it counts messages) | Code |
| 17 | Answers from the assistant | A plan, referral, discussion or profile named by the assistant opens over the Hub, so closing it returns to the answer | Code |
| 18 | Cover demo on a phone says "left and right" | Demo steps can have phone wording. Cover, Referrals and Choose colleagues now say "first, and ... below" or "tap a client at the top" on a phone | Demo checks: 14 of 14 pass |
| 19 | Terms: founding members | The repeated sentence is gone. New: a place stays yours while you sign in at least once every six months; after six months without signing in it ends, with an email reminder first. New: when you register, you see how many places are left and choose whether to activate. The homepage FAQ mentions the six months | Read through |

## Before payments open (to build later, as agreed)

The six-month rule is in the Terms now, but nothing enforces it yet. Before payments open, build:
- the check that ends a founding place after six months without signing in;
- the reminder email that goes out before a place ends.

## Tests

- Targeted suites: 71 passed in one run, plus FU-04 after its update.
- Demo checks: 14 of 14 pass.
- Older failures still seen: RA-03, and ACC-04, which checks the address bar after the bell opens notifications. ACC-04 is a timing check on code v14 didn't touch.

## Still to do (Nick)

- Read through the privacy page when you have time.
- Check on your iPhone the three things marked above, which can only be confirmed on a real device: the date box, the Consult reply box with the keyboard up, and swiping notices.
