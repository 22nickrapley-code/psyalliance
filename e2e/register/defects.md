# Defect ledger

Severity: **High** stops a core promise (cover, referral, notification, data); **Medium** wrong or misleading for a member, or a security gap with limited reach; **Low** cosmetic or rare. "Baseline" is the deployed build (c131fdc); "candidate" is branch `candidate-1016`. Evidence IDs are in `register.md`; reports are in `reports/<run>/`.

| ID | Sev | Area | What happens | Baseline | Candidate | Fix |
|---|---|---|---|---|---|---|
| N16-02 | High | Cover, Refer | Two colleagues could both accept the same client; an owner could choose two colleagues for one referral; a cancelled plan could still be accepted | Fails (A, B, D, E, F) | Pass (A to H, RES-CONC-01) | 0114: locking functions, table guards, sibling settle; app calls them |
| N16-03 | High | Notifications | No notification was ever written: every insert failed on `send_after` (live: 0 deliveries ever) | Fails | Pass | 0114 `raise_notification` (one transaction, every column); `actor_type` cast found and fixed in testing |
| N16-04 | High | Email | No email can be sent: blocked by N16-03, and live has no email key | Fails | Pass on staging | Needs Nick: Resend key in Vault, psyalliance.org verified in Resend |
| NAV-01 | High | Whole app | Now and then a page change or save arrives but the screen never moves (about 1 in 5 message sends, and about 1 in 4 cover Accepts, on staging); members press again, and later clicks can do nothing. It happens inside Next.js/React (same in 15.5.28), not in our code | Stalls | Recovered every time in probes (sends 24/24, Mark useful 10/10, Accept 12/12) | Watchdog in `live.tsx`: once the page's data has fully arrived, if the screen still hasn't moved after 2.5 s (4 s for a save on the same page) it opens the page normally. A redundant refresh after Accept removed. Confirm on live with LIVE-03; retest on Next 16 later |
| R04 | High | Settings | Deleting an account directly could leave the member's files behind | Fails | Pass (R04-A, J-DATA-03) | 0114: deletion refused while files remain; app removes files first |
| AUTH-02 | Medium | Sign-up | Signing up again with a registered email sent nothing and said "check your inbox" (Nick, 15 Oct) | Fails | Pass | The owner gets a sign-in email; same neutral wording either way |
| AUTH-01 | Medium | Sign-in | A reset the mail service refused or rate-limited was shown as sent | Fails | Pass | Failures and the one-a-minute limit are said plainly |
| DUP-01 | Medium | Messages | A double click on Send posted the message twice | Fails | Pass (RES-CONC-02) | One press, one save (`live.tsx`) |
| N16-01 | Medium | Settings | "Every two weeks" digest failed to save (constraint) | Fails | Pass | 0114 constraint and digest timing |
| N01 | Medium | Consult | Mark useful didn't save | Fails | Pass | 0114 `set_response_useful` (author only) |
| N02 | Medium | Refer | Back from the review step lost the chosen colleagues | Fails | Pass | Picks carried on Back; form drafts |
| ERR-01 | Medium | Whole app | A refused save showed the database's own wording; a failed message lost its text and recipient | Fails | Pass (RES-FAULT-01/02) | `friendly()` in 11 action files; message drafts kept |
| EMAIL-01 | Medium | Email | A rate-limited or failed send was marked failed for good | Fails | Pass (RES-EMAIL-01 to 03) | 0114: three more tries, 5/15/45 minutes apart |
| SEC-01 | Medium | Files | Any signed-in account could upload files into the shared Library folder (none has on live) | Fails | Pass (ADM-SEC-05) | 0114: admins only |
| A11Y-01 | Medium | Accessibility | Small text below 4.5:1 contrast on 8 pages; two colleague lists without a name | Fails | Fixed; see A11Y results | CSS and a label |
| N03 | Low | Onboarding | Pending member's Home pointed away from the in-product demos | Fails | Pass | Link |
| DEMO-01 | Low | Demos | Escape didn't close a demo when focus was inside it | Fails | Pass | Player passes Escape to the dialog |
| DEMO-02 | Low | Demos | Demos page sent members to a sandbox control that wasn't there | Fails | Pass | "Open your sandbox" on Demos |
| R16-A | Low | Platform | `X-Powered-By: Next.js` header | Fails | Pass | `poweredByHeader: false` |
| HYD-01 | Low | Whole app | React hydration error on 1 to 6 of 474 page loads when four browsers load pages at once; not reproduced in 72 loads on a development build; React redraws the page, nothing is lost | Seen | Open | Watch for it in live error logs; revisit with the Next 16 upgrade |
| PERF-01 | Low | Performance | Home waits on several database round trips one after another (19 s with 3 s per round trip injected) | Same | Open | Batch Home's queries; low priority at today's latency |
| AUTH-05 | Low | Sign-in | Asking for a second reset within a minute shows the one-a-minute message, which an unknown address never gets | n/a | Accepted | Trade-off for Nick's 15 Oct problem; wording stays conditional |

## For Nick to decide (not defects)

- **One notice per conversation per day.** A second message in the same conversation within 24 hours raises no new notice or email. Fine while unread; after the first is read, the second goes unnoticed except in Messages.
- **Answered cover requests move below open ones** after a refresh rather than staying exactly where they were.
- **Physician portal** (paused; the database refuses referrals): its form asks for patient initials, which the rest of the product forbids. Decide before reopening it.
- **Backups.** Supabase's database backups don't include stored files. The local rehearsal restored both together cleanly; on the hosted projects files need their own copy.
