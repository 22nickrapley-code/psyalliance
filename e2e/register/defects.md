# Defect ledger

Severity: **High** stops a core promise (cover, referral, notification, data); **Medium** wrong or misleading for a member, or a security gap with limited reach; **Low** cosmetic or rare. "Baseline" is the deployed build (c131fdc); "candidate" is branch `candidate-1016`. Evidence IDs are in `register.md`; reports are in `reports/<run>/`.

| ID | Sev | Area | What happens | Baseline | Candidate | Fix |
|---|---|---|---|---|---|---|
| N16-02 | High | Cover, Refer | Two colleagues could both accept the same client; an owner could choose two colleagues for one referral; a cancelled plan could still be accepted | Fails (A, B, D, E, F) | Pass (A to H, RES-CONC-01) | 0114: locking functions, table guards, sibling settle; app calls them |
| N16-03 | High | Notifications | No notification was ever written: every insert failed on `send_after` (live: 0 deliveries ever) | Fails | Pass | 0114 `raise_notification` (one transaction, every column); `actor_type` cast found and fixed in testing |
| N16-04 | High | Email | No email can be sent: blocked by N16-03, and live has no email key | Fails | Pass on staging | Needs Nick: Resend key in Vault, psyalliance.org verified in Resend |
| NAV-01 | High | Whole app | Now and then a page change or save arrives but the screen never moves (about 1 in 5 message sends, and about 1 in 4 cover Accepts, on staging); members press again, and later clicks can do nothing. It happens inside Next.js/React (same in 15.5.28), not in our code | Stalls | Recovered every time in probes (sends 24/24, Mark useful 10/10, Accept 12/12). Live, 17 Oct: 10 of 10 sends on screen in 1.3 to 1.7 s | Watchdog in `live.tsx`: once the page's data has fully arrived, if the screen still hasn't moved after 2.5 s (4 s for a save on the same page) it opens the page normally. A redundant refresh after Accept removed. On live (LIVE-03, 17 Oct) a save that moves to another page always loads that page in full, because Next.js can't fetch it from its own server on Cloudflare, so those saves can't stall. Same-page saves still rely on the watchdog. Retest on Next 16 later |
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
| HYD-01 | Low | Whole app | React hydration error on 1 to 6 of 474 page loads when four browsers load pages at once; not reproduced in 72 loads on a development build; React redraws the page, nothing is lost | Seen | Open (parked 18 Oct: not seen in the 18 Oct route sweep) | Watch for it in live error logs; revisit with the Next 16 upgrade |
| PERF-01 | Low | Performance | Home waits on several database round trips one after another (19 s with 3 s per round trip injected) | Same | Fixed 18 Oct (`fixes-1018`) | Home and the menu load in parallel: 2.7 s to 1.2 s at 300 ms per call |
| AUTH-05 | Low | Sign-in | Asking for a second reset within a minute shows the one-a-minute message, which an unknown address never gets | n/a | Accepted | Trade-off for Nick's 15 Oct problem; wording stays conditional |

## External retest, 17 Oct, and the 18 Oct round (branch `fixes-1018`)

| ID | Sev | Area | What happens | Before | `fixes-1018` | Fix |
|---|---|---|---|---|---|---|
| R17-01 | High | Eligibility | A member suspended (or whose license expired) after being asked could still choose a referral colleague, change a reply, react, agree to continuity or mark a reply useful. Accepting cover was already refused: the report's cover path wasn't reproduced | Reported; cover path not reproduced | Pass (R17-01-A to J) | 0115: network-member checks in each function and table guard |
| R17-02 | Medium | Privacy | A reply's author could read the asker's private "useful" mark | Reported | Pass (R17-02-A to C) | 0115: column revoked; asker reads marks through `consultation_useful_marks()` |
| R17-02-D | Medium | Consult | Found in testing: after 0115, the Consult list and Home lost their reply counts (`(count)` needs table access) | n/a | Pass | Counts taken from reply ids |
| R17-03 | Medium | Cloudflare | An inline reply that returns to the same page at a #section didn't settle on Cloudflare | Reported | Pass (CF-01) | `live.tsx` |
| R17-05 | Medium | Cloudflare | A tab open from before a deploy failed its next save | Reported | Pass (CF-03) | Stale tabs reload once |
| R17-04 | Low | Cover | Back from review lost the colleagues, how to ask and the message | Reported | Pass | Choices carried on Back |
| R17-06 | Low | Profile | The import could show setup details to a member | Reported | Pass | Plain wording only |
| R17-07 | Low | Continuity | Essentials done with blanks said 100% complete | Reported | Pass | Says what's left |
| R17-08 | Low | Settings | A second menu change (Unblock, Show Demos) didn't show on Cloudflare | Reported | Pass (CF-02) | Same as R17-03 |
| R17-09 | Low | Admin | Network health showed zeros for referrals and cover | Reported | Pass | 0115 `admin_network_health()` |
| A11Y-02 | Low | Accessibility | Found in testing: the new amber chip text was 4.4:1, and the numbered join steps were dark on dark | n/a | Pass (A11Y, 28 pages) | Amber `#94590d`; light steps on the dark card |
| R18-15 | Low | Network | Found in testing: on a first visit, Network's suggested faces were grey until the next page | n/a | Pass | Each list sets its own colour |

## For Nick to decide (not defects)

- **One notice per conversation per day.** A second message in the same conversation within 24 hours raises no new notice or email. Fine while unread; after the first is read, the second goes unnoticed except in Messages.
- **Answered cover requests move below open ones** after a refresh rather than staying exactly where they were.
- **Physician portal** (paused; the database refuses referrals): its form asks for patient initials, which the rest of the product forbids. Decide before reopening it.
- **Backups.** Supabase's database backups don't include stored files. The local rehearsal restored both together cleanly; on the hosted projects files need their own copy.
