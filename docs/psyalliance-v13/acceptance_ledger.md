# PsyAlliance v13: acceptance ledger

Nick's 15 Nov list, the user test report of the same day, and the security pass before going public. Everything was checked on a local build: desktop, plus phone where the change shows on a phone.

## Nick's list

| # | Item | What changed | How it was checked |
|---|---|---|---|
| 1 | The calendar opens a day list instead of the plan | Each plan on a calendar day opens that plan directly. Clicking empty space on a day still lists that day's plans | Clicked a plan on the calendar: it opened "October practice cover" |
| 2 | "Verified by a person" | Now reads "every license checked by the PsyAlliance team against state board records". The same wording is used on sign-up, the verification page, the start page, the waiting checklist and the demos. The trust heading is "Checked by our team" | Homepage, sign-up and verification pages |
| 3 | Password eye on the first box | Couldn't reproduce in Chromium: both eyes reveal on sign-up and reset, on desktop and phone. Made sturdier: the eye keeps the cursor in the box, can't be swallowed by the label around it, sits above anything a password manager draws, and Edge's own eye is hidden | Tested both boxes on both pages. **Needs Nick: which browser, and do you use a password manager extension?** |
| 4 | Demos look clickable | A "Recorded demo · watch only" badge on every demo. Clicking the screen pauses it and says it's a recording, with "Create your account" (or "Try it yourself" inside the app) and "Keep watching" | Screenshots; the message centres on desktop. Demo checks: 14 of 14 pass |
| 5 | Founding-member copy | "The first 40 members in each state are founding members, free for life. After that, membership is $30 a month. Once you've created your account, you'll see how many founding places are left in your state." The same in the FAQ. The Terms keep their notice before any charge | Sign-up page. The places left show in the Hub and profile after sign-up |
| 5a | Payments | Not built (your decision: later, before any state nears 40) | Nothing to check |
| 6 | Date format | Every date box now shows the chosen date written out US-style underneath ("Sun, Nov 22, 2026"). The box itself follows the device's language, so US computers already show month/day/year | Screenshot of Plan cover. Account pages (credentials, availability, older cover screens) show the same line; built and their tests pass, not screenshotted |
| 7 | Assistant box | It grows a line at a time, up to five lines, then scrolls. Enter asks; Shift+Enter starts a new line. A ✕ clears it. On a phone, a longer question takes the full width with the buttons beneath | Desktop and phone screenshots |
| 8 | Cover: a question doesn't show | The question is quoted in "Needs from you", and the colleague's conversation is open on the client by default. The tab, the client and the list all say "Question asked" (no more "In discussion") | Test plan with a question: thread open, question shown |
| 9 | The sandbox asks too much | Five arrivals about seven to eight minutes apart, held back while three or more things need you (0136). The sandbox wording says "every seven minutes or so" | SQL run twice. The hold is on screen; the timing needs a real visit to see |

## User test report

| Item | What changed |
|---|---|
| P1.1 verification wording | As item 2 |
| P1.2 demos | As item 4 |
| P1.3 pricing | As item 5 |
| P1.4 registration bug | As item 3 |
| P1.5 cover statuses | As item 8: one name per state, and the question in view |
| Backup clinician wording | "Your designated backup clinician", stepping in only if you suddenly couldn't practice |
| Templates are admin documents | The Library header says these are practice administration documents and guides, not clinical treatment manuals |
| Access before verification | The Library and sign-up say templates open once your license is verified; overviews are open to everyone |
| Founder story | Rena's name, credential and photo are back (your decision). The story says she co-founded PsyAlliance with Nick Rapley, as before v6 |

Left for later, as agreed: pre-filled templates, a simpler cover journey, client-consent steps, passkeys, payments, the family-physician referral flow.

## Security pass

**Read-only Supabase security check, 15 Nov (live and sandbox).** No errors. The empty v4 table is now closed on live, so 0135 has been run there.

The warnings:
- **12 helper functions without a fixed search path:** fixed in 0136.
- **46 functions a signed-out visitor can call:** each was called signed out on the local copy. All refuse ("Sign in first", "Admins only") or answer only what's public: sandbox links, sign-up forms, the founding count, the public Library list.
- **171 functions a signed-in member can call:** these are the app's own actions, and each checks who is asking. The access tests below cover the private ones.

**Fixed in v13:**
- **Unverified accounts could download templates.** They could get them three ways: straight from storage, through the old "copy" address, or through the My Files copy action. All three now need a verified license (0136 and code).
- **The demo step counter could be flooded.** It now has a limit.

**New and extended tests:** `access-isolation.spec.ts`, 11 of 11 pass.
- A member who isn't involved can't read or change another member's plans, referrals, questions, messages, files, continuity plan, notifications or drafts.
- A signed-out visitor reads nothing private from any table and can't change anything.
- Private files are closed.
- Sandbox visitors never appear to live members.
- Library files are closed to unverified members.
- Text members write is shown as text, never run as code (tested in messages and Consult).
- Admin pages and admin functions are refused to non-admins.
- Unverified members can't open or copy templates by their address.
- Pages carry headers that stop framing and type sniffing.

**Checked and fine:**
- "Back" links and sign-in redirects only go to pages on this site.
- Message files download as attachments, never shown in the page.
- Public forms and sandbox requests have hourly limits.
- Signing in and signing up are rate-limited by Supabase.

**Still open:**
- **Package advisories** (PostCSS and source-map-js, inside Next.js; build-time only). Update when Next.js updates.
- **A full browser content policy:** recommended as a separate task after launch.
- **Sandbox quota:** the public start-sandbox function is limited to 30 an hour, so someone could use up that hour's quota. Low impact; a shared secret between the two sites would close it. Needs a Cloudflare setting, so I'd do it after launch.

## Test runs

- Targeted suites: cover-ui, messages-ui, v15, network-consult-ui, followup, settings-account, referrals, account-pages, access-isolation (59 passed in one run, 8 in another).
- Demo checks: 14 of 14 pass.
- The same older tests as v12 still fail, and they fail before v13 too: CV-02, MSU-01, RFU-03, RA-03, PB-01.

## Needs Nick

- **Password eye:** which browser was the tester on, and does it happen to you with a password manager extension on?
- **Cloudflare:** disconnect the automatic Git build (Settings → Build).
- **Terms:** a lawyer should review them before the general public relies on the free-for-life offer.
