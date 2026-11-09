# v6 acceptance ledger (Nick's 9 Nov walkthrough)

Build: branch `v6`, local staging copy (fictional members, local database, AI stand-in), plus a second local copy set up as the sandbox (`app_env = demo`, demo build). Desktop 1365 wide. **The full regression suite was not run, at Nick's request** (the reviewing LLM runs it, and tests with real people on the real site). What was run: the new `e2e/tests/staging/v13/v6-sandbox.spec.ts` (V6-SBX-01 to 06) and `v5-sandbox.spec.ts` (V5-SBX-01 to 05, with V5-SBX-04 rewritten for the retired guided tasks): 11 of 11 passed on the sandbox build. The SQL ran twice cleanly. TypeScript compiles. Screens were captured and reviewed for every item marked "screens".

| ID | Your feedback | What changed | Evidence |
|---|---|---|---|
| S1 | Remove "What would you like to try" | Guided tasks retired; the sandbox is free to explore; Settings offers "Watch a demo"; the sandbox landing page and the tour say the same. | V5-SBX-04, V6-SBX-01 |
| S2 | No outgoing plans at the start; reactive arrivals | A new guest has no cover plans or referrals of their own. Eight incoming arrivals, 2 min then every 4: cover, referral, question, cover, question, referral, message, reply. | V6-SBX-01, SQL check |
| S3 | Completed referral listed under Active | Completed and withdrawn referrals sit under Completed (no separate "Close" step needed to move them). | V6-SBX-04 |
| R3 | "Not available" should move to Completed | An incoming referral you decline, or whose window closed, sits under Completed, grey. | V6-SBX-04 |
| C1 | Incoming cover card messy, duplicated buttons | Rebuilt like the incoming referral: track, The need (everything the colleague filled in), their message, one set of choices, the conversation. The "Needs from you" block and the second copy of the buttons are gone. | V6-SBX-02, screens |
| R1 | Journey line to the discs | One track: the referring disc, the stages and the receiving disc on one continuous rail, the same size and evenly spaced; the receiving disc is dashed until agreed. Used for referrals, incoming cover and your own cover plans. | screens |
| R2 | Quick view of the conversation; question box in the card | Ask a question opens the box in the card; the question and every reply stay in the card's Conversation section, also when you come back later. "Open conversation" (to Messages) is gone from incoming cards. | V6-SBX-03, screens |
| N1 | The need collapsible; location, setting, age inside it; message in its own box | The need is one collapsible box with bold titles (location, setting, age, frequency, insurance, language, prescribing, timeframe or dates, audience, client details shared). The colleague's message sits in its own coloured box. Used in referrals, cover, Add recipients and your own cover clients (collapsed there). | V6-SBX-02, screens |
| N2 | "Reply by" wraps under a long name | "Reply by" now sits under the name in every row, so rows line up. | screens |
| N3 | "You said you can accept" badly formatted | A proper panel: "You offered to take this referral", a short line, and a "Withdraw my offer" button. The same for cover. | screens |
| N4 | Add recipients forgets the need | The need you are matching sits at the top, then "Already asked", then "Colleagues who fit, best match first". | screens |
| N5 | Always a Done button | Every pop-up without its own footer now has Done; incoming cards and your referrals have Done too. | screens |
| N6 | Referral agreed record not pleasing | The middle card is centred (no repeated line); names sit neatly under each disc. | screens |
| C2 | Pre-select two colleagues per client | Up to the two best matches for each client are already chosen when you reach Choose colleagues, with a line saying so. | code review |
| P1 | Photos in every disc | The workspace now shows the member's own photo and every colleague's who has one (signed links, fetched in one fast call); initials otherwise. Sandbox colleagues keep initials. | SQL check; not seen with a real photo locally |
| W3 | Photo disappears after saving the profile | Same cause: the workspace never showed photos. Fixed by P1. | as P1 |
| C3 | No space before "Your message" in Review | Space added. | CSS |
| C4 | "Change this client's needs" asks for a plan name | Fixed: only the client's details are sent; the plan's name and message are untouched (before, it would also have cleared the message). | code review |
| C5 | "Cover agreed" twice | Both buttons say "Agree cover". | screens |
| C6 | Handover needs all three ticks | The three points stay as a reminder; "Confirm handover" works without them. | screens |
| H1 | One action per plan | Several things waiting on one cover plan (or one colleague's request about several clients) become one action that opens the plan: "Spring leave: 3 things need you", with what is waiting. | code review |
| H2 | Later should snooze | Later snoozes for 4 hours, 24 hours (default) or 3 days, set in Settings, "When you press Later". It comes back sooner if anything new happens. Snoozed actions sit behind one quiet line with Show. | V6-SBX-05 |
| M1 | Attach from the Library and your own library | The paperclip opens: From your computer, Your library (My files and saved templates) and the PsyAlliance Library. | V6-SBX-06, screens |
| NW1 | Network counts top right, period moved up | Done. | screens |
| W1 | Homepage traffic-light colours | One brand green for Cover, Referrals and Consult on the homepage. | screens |
| W2 | No founding counts in the hero; two sentences | Removed from the hero; the bottom block is two sentences, no counts. Sign-up: the founding box is two sentences, and it is no longer repeated three times on the page. | screens |
| W4 | "You're in / Licensed in..." copy | "You're verified: Once your license is verified, you can use everything PsyAlliance offers." | screens |
| W5 | "Don't use it" too blunt | Explains where the photo came from and that it becomes your profile photo on save; the button reads "Leave this photo out". | code review |
| A1 | Admin approves PDFs alone | Publish is always available to an admin ("Approve and publish"); the database lets an admin publish without reviewer approvals. | SQL; admin page not walked |
| W6 | No Rena photo; XXX for names | Photo removed; both names XXX until launch. | screens |
| D1 | Designer sweep | Removed duplicated lines (need summary in cover client cards, the need name in the agreement card, "Client need" repeated under its own heading); default Done on every pop-up; inline question box full width and scrolled into view; founders' story aligned with the page; sign-up stops repeating the founding line. | screens |

## Not proven here

- Photos with real uploaded photos (local data has none) and on Cloudflare.
- Attaching a Library or My files PDF end to end on the live storage.
- The admin Library page itself (the database rule was changed and checked; the button was changed but not clicked).
- Phone layouts (next round, after desktop sign-off).
- The full regression suite. Tests most likely to need updating for intended v6 changes: older sandbox specs that expect Rachel's own Fall leave plan or NY referral at the start (`sandbox.spec.ts`, `sandbox-final.spec.ts`, `r18-feedback.spec.ts` R18-14), anything that clicks "Open conversation" or "Message organizer" on an incoming card, anything expecting "Cover agreed" or "Mark handover ready", and founding-count assertions on the homepage and sign-up (`v5.spec.ts` V5-02, `r18-feedback.spec.ts` R18-13).
