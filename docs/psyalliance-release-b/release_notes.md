# Release B: release notes

Branch `release-b`, on top of Release A.1 (`f328ea1`), which is on top of Release A. Written 30 Oct 2026 against your 29 Oct implementation brief, sections 6 to 10 (Cover, Referrals, Consult, Messages and notifications, Availability and relationships). Nothing was pushed, deployed or run on either Supabase project. Release C (sections 11, 13, 21 and 22) has not been started. The runbook is `release_runbook.md`, the migration and rollback notes are `migration_and_rollback.md`, and scenario-by-scenario results are in `acceptance_ledger_b.md`.

## What Release B is

One release, as you decided. It finishes the Cover and Referral workflows, makes Consult and groups easier to reach, gives Messages real full-history search and properly tested file and voice drafts, and tightens Network and Availability. It has **one new SQL file, `0124`** (two small parts: a read-only search function, and a fix so the first message in a new conversation counts as unread), one build setting (so 10 to 20 MB files upload), and otherwise code and styles. **No email behaviour was changed.**

## What changed

### Cover (brief 6)

| Brief | What it is now |
| --- | --- |
| Draft names (6.1) | A Cover draft with no name is called "Cover draft · 3 Nov – 14 Nov" (or "Cover draft · 4 clients", or "Cover draft"), not "Untitled cover plan". The list of drafts shows these names with Continue and Delete. |
| Editing a client safely (6.1, 6.2) | Changing a client's needs after colleagues are chosen re-checks every chosen colleague. Anyone who no longer fits is removed from that client, nobody is quietly put in their place, and a note says who was removed and why ("A client's needs changed: Client 3: Dr X (not licensed in NJ) no longer fits and was removed. 2 colleagues still fit.") with a Dismiss button. |
| Deliberate selection (6.2) | Opening the matching step no longer preselects a colleague for every client. A colleague you came from (a profile) is the only exception and stays only if they are eligible. By colleague, you tick the clients you want and press Apply. |
| Bulk results (6.2) | After Apply, one note names the colleague and lists **Added to**, **Already selected for** and **Excluded**, each excluded client with its reasons. Toast: "3 clients added, 1 already selected, 2 excluded." Applying never sends anything. |
| Workload before review (6.2, 6.3, C03) | The review has a section "What each colleague would be asked": each colleague's number of clients, which states and settings, how many they would be asked **first** and how many are **queued** behind other colleagues, and their overall spaces and "Confirmed N days ago". It says spaces are not a cover limit, and spaces are never multiplied by states. Twenty requests to one colleague is visible there before approval. |
| Review wording and routes (6.3) | Correct singular and plural throughout (one client, one colleague, one invitation). Each client has **Change this client** and **Change colleagues**, which go back to the right step with the right client open and keep everything else. Reorder arrows are not shown for a single colleague, and the first "up" and last "down" are disabled at the ends. |
| Calendar (6.5, C06) | "Cover calendar" heading, "Both directions / Your cover plans / Cover for colleagues" filters with a key that explains each, a Today control, today and the selected day drawn differently, plan counts (not clients), and on a phone small dots with a count under each date instead of cut-off titles. Choosing a date opens its agenda in the existing date overlay: plan, direction, dates, state, and a link to that exact plan. The date overlay and the month agenda now stack the two directions in one column; a direction with nothing in it is a small strip that says so ("None of your plans on these dates.") instead of an empty box, and the colleague's plan has room to read. |
| Plain headings, one client (D09, D12) | Cover steps are named for the task: **Plan cover, Build your client list, Choose colleagues, Review your cover plan**, and the page button is **Plan cover** (it was "Arrange cover for my clients"). The promotional line "Good colleagues. A clear fit for each client." is gone. With one client there are no client tabs and no By client / By colleague switch, and the intro says "Choose who to ask about this client."; with several clients both come back. Inside a plan, the handover window is **Confirm handover for Client 2** (it was "Handover") and the retry window is **Find cover for Client 2**. The guided tour follows the new button name. |
| Cover design review (your "fine tooth comb") | I went through every Cover screen at 1920, 1440, 1100, 820, 390 and 320 px and fixed what I found. (1) The two Cover columns start their first cards at the same height; that fix was already in Release A.1 (it is why the live site, which does not have A.1 yet, still shows the stagger in your screenshot). (2) On a phone, the calendar no longer draws cut-off titles: it shows dots with a count, as designed (the dots were being hidden by a style rule, and the test for it could not fail; both fixed). (3) The "Needs your reply" pill was too narrow on a phone in the month agenda and the day sheet, so its words spilled outside it; fixed, with a test that failed before. (4) Opening a colleague's plan, the summary line now says what you have been asked ("1 client accepted by you. 1 invitation still needs your reply."), not the organiser's list of what still needs a colleague. (5) A Cover page with no plans says what to do: "You have no cover plans yet. Choose Plan cover to ask colleagues to cover your clients." and, for the other side, "No colleague has asked you to cover their clients. Requests appear here." (6) With one client, the Choose colleagues step no longer repeats its instruction under the heading. (7) A window now opens with keyboard focus on its close button; before, on a colleague's plan the focus box sat on the organiser's name and clipped the word beside it. |
| Deleting a draft (6.1, C06) | Deleting a draft names it, removes only that draft, and cannot touch a plan that is already live. |

### Referrals (brief 7)

| Brief | What it is now |
| --- | --- |
| Need list (7, R01) | **Main need** and **Also** use one shared, searchable list. It is still a real form field (forms, demos and tests keep working), with a search box in a pop-over. A need saved from an older release that is not in the list is shown as "(saved entry; choose a treatment area)" instead of being lost. |
| From a profile (7, R01) | A referral started on a colleague's profile keeps that colleague. If they are not eligible, the screen says why and does **not** swap in someone else. |
| Plain headings (D12) | The page button and the pop-up title are **Refer a client** (it was "Make a referral"). |
| Stages (7, R03) | Confirmation and tracking show three stages: **Request sent, Colleague interest, Placement confirmed**. Only a stage that has really happened is marked. A first send never marks placement; interest alone does not mark placement. The title is "Client referral · " followed by the actual need (for example "Client referral · Anxiety/Panic Disorders") at matching, review and tracking, with the selected need chips under it. |

### Consult (brief 8)

| Brief | What it is now |
| --- | --- |
| One recipient (8, Q01) | The review says "1 recipient" and names the person; many say "3 recipients" and name all. Nothing posts before the review button. |
| Groups (8, Q02) | A direct link, **Find or start a group**, from Consult (and "No group yet" explains groups are by invitation). It goes to the existing groups page inside the same shell. |

### Messages and notifications (brief 9)

| Brief | What it is now |
| --- | --- |
| **Full-history message search (M01)** | In Search, with the scope set to Messages, typing two or more letters searches **every message you can see**, newest first, 20 at a time with **Show more**. With the scope on All, a button "Search all messages for ..." does the same, so ordinary searching stays quick. Each result says who wrote it, when, in which conversation, with your words highlighted. Choosing one opens that exact conversation, loads older messages if needed, scrolls to the message and highlights it for a few seconds (the highlight survives the screen refreshing every three seconds). If you may no longer see it, you get a plain message instead. Needs SQL `0124` (part 1); without it the window says history search is not switched on yet and keeps the old behaviour. |
| Conversation count (M03) | When one colleague has several conversations, the inbox row says "3 conversations" (a labelled control that opens the list of contexts), shown differently from the unread-messages number, which stays the one navigation number. |
| **File and voice drafts per conversation (M02)** | Unsent text was already kept per conversation. Now an unsent **file** and an unsent **voice note** are kept too, per conversation, across switching, closing and reloading. A chosen file or recorded voice note is uploaded straight away; a restored one shows its name and size (a voice note shows "Voice note ready to send · 0:07") and is sent once. Removing, discarding or cancelling takes the stored file out again. |
| Upload failures (M03) | A failed upload says so, keeps the message and its text usable, and leaves nothing behind. Cancelling during an upload leaves nothing behind. |
| Access (M03) | Someone who is not in the conversation cannot add a file to it, remove a file from it, or read one. A removed message's file returns "not found". |
| 20 MB (M03) | The 20 MB limit is unchanged. Files between 10 and 20 MB now work (a framework body limit of 10 MB was cutting them off): a 19 MB file uploads and a 21 MB file is refused with a plain message. |
| Notification links (M01) | A notification for a referral message opens that referral's conversation, not the same colleague's other conversation. |
| Double send, retry, composing, two devices (M02) | Pressing Send twice, sending the same message id from two devices at once, and pressing Retry twice quickly all give one message. A message typed while another is still sending appears at once in its place and the box is free; sends leave one after another, so it waits its turn and arrives in order. Two devices on one account each show a sent message once. (The retry and de-duplication rules were already in place; this release tests them harder.) |
| **First message unread (real bug found by the new tests)** | When a conversation is created in the same step as its first message (a colleague pressing "Discuss first" on a referral, or the note that starts a Cover request), the recipient's read marker and that message got the same instant, so it was never counted as unread. A person added to a new conversation now starts one millisecond behind, so the first message is unread for them and the number on Messages, the account pages and the phone bar all count it. Needs SQL `0124` (part 2). Conversations that already exist are not changed. |
| **Failed saves are kept on this device (P01)** | If a draft could not be saved (Cover, Referral, Consult, availability, a message or a file) and you close the tab, the newest text used to be lost. Now it is also kept in the browser under your account while saving is failing, put back when you next open the workspace, and saved. If a different version was saved from another device in the meantime, that version wins and you are told. It is removed the moment a save succeeds; nothing is written while saving works. |
| Stray draft rows (real bug found by the new tests) | The browser could save an extra draft row named "message" that was never used. Fixed; existing stray rows are removed as members open the workspace. |

### Availability and relationships (brief 10)

| Brief | What it is now |
| --- | --- |
| Plain headings (D12) | The availability window is **Your availability** (it was "Room for the right referral."), the invitation window is **Invite a colleague** and says nothing is sent from it (it was "Bring your people closer."), and the question box is **Ask a question first**. |
| Reasons (10.2, N01) | Each person in Network has a reason that is specific and true where the data exists ("Collaborated on split-treatment care and medication consultation · August 2026", or the number of Cover clients covered together). Where history was not recorded it says so ("The details of what you did together were not recorded, so we cannot say more"). Suggested people say **Why:** and give their reason. No one gets a generic sentence. |
| Trust (10.2, N01) | The button says **Add to trusted colleagues** or **Remove from trusted colleagues**; adding is always your own decision. Worked with Before never makes someone trusted, and a Consult reply or reaction never makes someone "worked with". |
| Network circle (N02) | The circle is 280 px (smaller on a phone) and shows a selection of people; a person whose touch target would sit on another is left out of the circle rather than overlapping it, and the lists below always have everyone (five to a page, with the full count). Tested at 1365, 390 and 320. |
| Freshness (10.1, A01) | No code change: tested at 29, 30, 90 and 91 days that the label, the "available now" filter and the profile all read one timestamp. |
| Capacity (10.1, A02) | No code change to the numbers. Tested: one overall number, separate virtual and in-person settings for each state, a long city list and a pause date all fit at 390 and 320; nothing is multiplied by states and no Cover cap is invented. |

## Decisions I made that you may want to change

- **Full-history search is a database function, not a copy of messages.** It reads the live message table with the same visibility rules as the screen. At the current size that is fine. If messages grow into the millions it will need an index (a small SQL addition); say so and I will add it.
- **A file or voice note is uploaded the moment it is chosen or recorded**, which is what makes it survive a reload. The cost is that a file you attach and then abandon without removing it stays in storage until you send or remove it.
- **No separate "anonymous reference" number added.** The brief's example shows "Client referral — ADHD and an anonymous reference". The title now carries the real need, and the screen identifies the referral by that title, the state and setting, and its place in your list. I did not add a new reference number format. Tell me if you want one.
- **Cover calendar day agenda uses the existing date overlay** (the brief allows "below or in the existing date overlay").
- **The network circle shows a selection**, not everyone, so that targets never overlap. Everyone is in the lists beneath.
- **Text kept on this device when a save fails** is the brief's "preserve the latest local input". It is in the browser's own storage, per account, only while a save is failing. If you would rather nothing is ever left on a shared computer, tell me and I will keep it in memory only (then a closed tab loses it again).
- **Card order, menu order** and everything else from Release A is unchanged.

## Emails

**No email is sent, changed or newly triggered by Release B.** I did not touch the email provider, templates, queue or settings. Release B adds no notification type. Message search and drafts send nothing. The existing automated email tests (RES-EMAIL, AUTH, notification switches) were part of the regression run.

## What I tested, and what I could not

Local staging copy, fictional people only, from a production build of this branch.

- **New Release B checks (40 tests, 42 runs because the network circle test runs at three widths):** B-01 to B-15 with B-01b, B-03b and B-04b (Cover, calendar and day sheet, referral, Consult, message search, counts, relationships, freshness, headings, handover window), MB-01 to MB-12 (message drafts, files, voice, failure, cancel, access, double send, notification link, one colleague with two contexts, composing while sending, two devices), NB-01 to NB-03 (network circle at three widths, availability on a phone, one confirmation time), QB-01 to QB-03 (Consult audiences, drafts, privacy), PB-01 to PB-04 (a failed save is kept and put back). All passed before the full run.
- **Full regression:** see the results block in `acceptance_ledger_b.md`.
- **Screens looked at** at 1365, 390 and 320 (and for Cover also 1920, 1440, 1100 and 820): the Cover list, calendar and day sheet, every Cover pop-up step (including the new workload section), a plan you made, a colleague's plan to you, the handover window and an empty Cover page, the referral form, Consult, Network, Messages search. The screenshots are in the message that comes with this bundle.

Not testable here:

- **Cloudflare.** The build, the Worker size and whether a 10 to 20 MB upload passes through the Worker. Please try a 15 MB file on the sandbox (runbook step).
- **A real phone**, **keyboard-only and screen-reader use by a person**, and real microphone hardware. The voice tests use a fake microphone in a real browser.
- **Real email.** Not part of Release B.
- **1,200 colleagues in Consult** and **sequential outreach races** are from Release A and earlier (RA-14, NC, CV, SBX tests); Release B did not change them and I did not rebuild those fixtures.

## What I would watch

- Message search on the sandbox after you run `0124`: type a word you know is in an old message and open the result.
- A 15 MB file in a message on the sandbox.
- The Cover review's new workload section on a plan with several colleagues: does it say what you need before you press Send?
- The Network circle on your phone: it now shows fewer people by design; are the lists below enough?
