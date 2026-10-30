# Release C: release notes

Release C is the last of the three releases for the 29 October brief (sections 11, 13, 21 and 22, and group management from section 8). It sits on top of Release B, so the bundle contains Release A, A.1 and B as well. **Nothing has been deployed or pushed.**

## What members will notice

**Settings gets three new sections** (all optional, all private):

- *What would be useful to you at the moment?* Eight optional choices (starting independent practice, rebuilding a caseload, finding a professional perspective, planning time away, returning or relocating, reducing or closing practice, something else, prefer not to say) with Skip. Nobody else can see them; they are never used to decide who can do what.
- *How would you like colleagues to approach you?* Referral requests, Cover requests and Consult invitations each have their own switch and their own pause, with an optional "pause until" date and a Resume button. A pause only stops **new** requests: work already agreed, requests already sent, and conversations carry on. When a pause date passes, the member is asked to review; it does not reopen by itself, and it never refreshes the 90-day availability confirmation. No reason is asked for.
- *Alerts on your phone.* Free web-push alerts on a phone or computer, an optional phone number for text alerts (with a tick-box consent, a Remove button and a STOP reminder), and optional quiet hours. An alert says only the colleague's first name and the kind of request ("Avery has sent you a Cover request. Review request."). Never a client or anything clinical. The push itself carries no text; the phone asks the app for the wording while signed in. Opening an alert only navigates; it never accepts, declines or changes anything.

**Use as a starting point.** On a Cover plan (open or closed) and on a referral you own, a new button starts a fresh draft from its requirements. New ids; dates, recipients, replies, assignments and handover progress are not copied; nothing is sent; the normal review applies.

**Groups.** The creator can appoint organisers; organisers can edit the charter, invite and remove members; ordinary members cannot. Every charter version is kept and joined members can read the earlier versions. A member who leaves or is removed loses access.

**Links keep their destination through sign-in.** A notification link opened while signed out goes to sign-in and then to the same page.

**Profile.** The two completion measures are now named: *Essential setup: x of 4* and *Optional detail: y of 8*. A photo no longer looks like an expired licence.

**Library (phones).** A single Collection selector replaces rows of filter buttons. The continuity plan reaches its first editing step sooner on a phone.

## What visitors will notice

- A **lifecycle band** on the home page, directly after "How it works": "Support at every stage of practice." with the brief's three situation lines (trimmed; see the wording list), a link to the demos, a link to the new route, and one sentence stating who can join.
- **Show me how PsyAlliance could help** (`/start`): one question, six needs and a quiet "I'm here to offer support" route; an optional follow-up with Skip; a headline and benefit for the chosen need; a short demo or "Try this scenario" (the existing fictional demos, with "Fictional practice environment", "Reset scenario" and "Change scenario" now shown in the demo bar); one hands-on exercise; "What will they receive?" with a "Back to my view" button; and a starting summary with the next step. No email address is asked for anywhere.
- **Continue with these choices** keeps only the structured choices (a need, an optional context, optional help kinds, an expiry) in a 24-hour cookie. After sign-in the member sees "We've used your choices to get you started" with Review and Start fresh, and one button that opens the right **unsent** place: a Cover or referral or Consult start screen, the participation settings, or a choice between a referral and the continuity plan. Nothing is published, switched on or sent.
- **The public Library no longer promises every template.** Templates available now say "Members get it now"; the others say "Coming soon". The professional-review gate was not touched, and (keeping your 18 October rule) no public page uses review wording.
- **Phone sign-up shows the form first.** The brand uses the approved logo file in the public header and footer.

## Wording changes for your approval

Every public sentence that differs from the brief, and why:

1. Lifecycle band, *Starting out*: brief says "Find colleagues to ask, share perspectives and become known for the work you do." Now "Find colleagues to ask and share perspectives with." ("Become known" promises visibility that depends on verification and on the member's state opening.)
2. Lifecycle band, *Changing pace or direction*: brief says "Coordinate time away, reconnect on your return or plan referrals as you reduce your practice." Now "Coordinate time away, plan referrals as you reduce your practice and review your options on your return." ("Reconnect on your return" implied a feature that does not exist.)
3. Added under the band: "Membership is for doctoral-level psychologists and psychiatrists with an active US licence, which a person checks before you are listed." (The brief requires eligibility to be clear and nothing for trainees or retired members.)
4. Library hero and count: "Members open and download the templates that are available now, and the others are added as each is released" and "N available to members now; the rest are added as each is released" replace "members open, download and save every template" and "Members get every template".
5. Library template page: "Members get it now." appears only for templates that are available; the others say "Coming soon. The (template) is not available to members yet. It opens in the Library as soon as it is released."
6. Home page Library blurb and the Library lead form: same change as 4.
7. Sign-up step 3: "The Library and a sandbox ... are open to you straight away" is now "A sandbox with fictional colleagues is open to you straight away, and the Library lists every template."
8. Guide copy follows the brief's headline and benefit lines exactly for the five needs; "Just explore" and "I'm here to offer support" headlines are mine ("Cover, Referrals and Consult in one place"; "How colleagues would reach you") because the brief gives none.

## What is not in this release (said plainly)

- Phone alerts and texts have been tested against a **mock** push service and a **mock** text sender only. A real phone has not been tried, and no real text was sent. Texts need a paid sender account (Twilio) and, in the US, carrier registration; until then they are switched off.
- Alerts are sent by a small route that something has to call every minute. Setting that up is a step in the runbook; until then alerts queue and wait (they expire after a day).
- Email alerts for requests already existed and were not changed.
- The guide uses the existing demos. It does not create a separate practice sandbox per scenario with its own seeded data; the existing fictional demo scenes (with Reset scenario) stand in for that. The sandbox site was not changed.
- Prefill of the real profile from sign-up answers is not built: the carried choice only opens the right place and never fills a profile field. The only values carried are the ones listed above.
- Passkeys, AI-assisted entry, semantic search and participant testing (L09, L10) were not part of this build.
- The full "one Library catalogue" merge (F07) and a complete pass over every account page's content layout (D23) are not done beyond what is listed in the ledger.


# Part 2: practice scenarios, rebuilt demos, one Library, reviewable suggestions

(Added after your 30 October answers. It is in the same bundle.)

## What visitors will notice

- **Six need walkthroughs** (about a minute each, skippable and replayable, from the starting page's "Watch the short demo" and "Try this scenario"): Establish or rebuild a caseload, Arrange time away, Find a colleague for a client, Get another professional perspective, Reduce or wind down practice, Offer support to colleagues. Each runs the real product screens on its **own practice scenario** (a small fictional practice with its own availability, colleagues and unfinished work), has one step marked "Your turn", an optional "What will they receive?" panel (the generic alert line only, then "Back to my view"), and an ending that restates what happens next and carries the same need into sign-up (`/start?need=...`).
- Every practice screen says **Fictional practice environment. Nothing here is saved or sent.**, and has **Reset scenario** (puts that scenario back to its start) and **Change scenario** (the choice page).
- The existing demos keep their routes. Their wording now says what the product does: pausing never reopens by itself, alerts are one short line, and Library saving is a bookmark while saving a copy is a private file in My files.

## What members will notice

- **The Library is one place.** Old Documents addresses now land on the Library (a template's old name or PA number opens the Library on that template). My files and the professional-review page stay where they were. In a template, "Save resource" bookmarks it; **Save a copy to My files** makes a private file. Links from Consult, Referrals, Credentials and Continuity point at the Library.
- **Suggestions from the public guide are reviewable.** On "We've used your choices to get you started": each suggestion says where it came from, has Discard, and nothing is saved until Save my choices. If the account already has a setting, it is shown and kept unless changed here. Nothing from a practice scenario ever reaches a profile, and a caseload choice never sets places.
- The Notifications page is titled Notifications; categories say Referrals, not Refer.

## How the practice scenarios work (important)

The practice workspace runs **in the visitor's browser** on fixture data (`src/tour/scenarios.ts`). It never calls the database, so it cannot touch live or sandbox rows or grant a role, and Reset simply reloads the scenario. The "own colleagues" are the same invented colleagues, with each scenario changing availability and which discussions are visible. **If you wanted scenario-specific accounts stored in the sandbox database, that is a larger change I have not made.** SQL 0126 adds a read-only `practice_scenarios` catalogue so the demo site, the sandbox and analytics agree on the six ids. Analytics: practice events (`task_start`, `recipient_preview`, `interaction_complete`, `summary_continue`) are written to the `practice` namespace, never `real`.

## Route mapping

| Old | Now |
|---|---|
| `/dashboard/documents` | `/dashboard/library` |
| `/dashboard/documents/<name or PA-nn>` | `/dashboard/library?resource=PA-nn` |
| `/dashboard/documents?tab=mine` | unchanged (My files) |
| `/dashboard/documents/review` | unchanged |
| starting page "demo" per need | `/tour/caseload`, `/tour/time-away`, `/tour/client-referral`, `/tour/perspective`, `/tour/reducing`, `/tour/offer-support` (Just explore: `/tour`) |
| `/tour/scene/<demo>/<step>` | same; the walkthroughs load their scenario by demo key |
