# Release A: release notes

Branch `release-a`, on top of version 15 (`22a0c35`). Written 29 Oct 2026 against your 29 Oct implementation brief. Nothing was pushed, deployed or run on either Supabase project. Release B and Release C have not been started. The runbook is `release_runbook.md`, the migration and rollback notes are `migration_and_rollback.md`, and the scenario-by-scenario results are in `acceptance_ledger.md`.

## What Release A is

The restrained look, the three-card Hub with one action list, the five-item phone bar with Search in the top bar, and the correctness items the brief puts first. It is one new SQL file (a read-only function) and otherwise code and styles.

## What changed

| Brief | What it is now |
| --- | --- |
| Palette (4.1) | The earlier forest, sage, cream and white palette from the brief's values (`#203b32`, `#142b23`, `#e9efea`, `#f7f6f1`, `#26352e`, `#e5e9e3`), secondary text `#536559`. One new stylesheet, `restrained.css`, loaded last on both the workspace and the account pages. Version 15's strong blue/terracotta rows and coloured area fills are gone (`bold.css` deleted). Cover `#2c6852`, Referrals `#925716` and Consult `#794b70` remain only in icons, small controls and subtle tints. Ownership is spelled out in text, not red/green. |
| Hub (3) | A greeting, one actions control, three white cards, a small "Invite a colleague" line. No hero, fourth tile, counters, discussion panel, availability graphic or draft pickers. Each card is one button: **Refer a client**, **Plan cover**, **Ask a question**; it opens the pop-up and never navigates. Same labels whether you have work or not. |
| One action list (3.3) | "**N things need your attention**" (singular for one, "You're up to date" at zero). Click: the whole list opens in place with Collapse; the open state survives moving between pages. Rows: what to do, anonymous client/plan/question, colleague, real due date, one button. They are in a steady order (service, then plan, client), not ranked. Every client needing its own decision is its own row (three clients, three rows). A reply or message is not counted. The number equals the rows, including any beyond the first screen (no hidden paging). If the workspace cannot load at all you get a plain "We could not load your workspace" page with Try again (it used to be the framework's generic error page); inside the Hub, if the lists ever arrive missing, it says "We could not check what needs your attention" with Try again. It never says "up to date" without having checked. |
| Later and Set aside | **Later** moves a row to a "Set aside" list below and the count drops. **Restore** reverses it. The work is untouched and still open. It is stored on your account, not the browser: reload or another device shows the same list. A set-aside row **comes back by itself** if something materially new happens to it (a new reply, a changed status, a passed deadline). Setting aside never accepts, confirms or closes anything. |
| Practice reminders | Availability re-confirmation is a separate one-line reminder with a one-tap "Confirm unchanged" and "Edit", not counted as client work. |
| Consult help (your decision) | Recent questions that fit your specialisms, your groups or trusted colleagues appear as a separate, **uncounted** group, and a quiet dot on Consult in the menu until you visit Consult. You can turn the group off in Settings, Notification preferences, "Questions you could help with" (it stays off on other devices), or hide one question with "Not for me". A question sent straight to you is a normal counted row. |
| Navigation (2) | Left menu: The Hub, **Referrals, Cover, Consult** (your order, not the brief's), Network / Search, Messages, Library. Phone bar: Hub, Referrals, Cover, Consult, Messages, on every page, workspace and account. No More. Library, Network / Search and Availability sit in the phone menu and the profile; the bell stays separate. |
| Search (2, 9) | A clearly named **Search** button in the top bar on every page and phone width. The window has scopes: All, Colleagues, Referrals, Cover, Consult, Messages, Library. Results are labelled by what they are. (Message results match a conversation's name and its latest message, and the window says so under the results: "Older messages are not searched here". Full-history search is Release B.) |
| One unread number (9, F01) | Workspace, account pages and phone bar now all show **unread messages**: someone else's, not deleted, newer than your last read, group messages from people you blocked excluded. Company notices and notifications are on the bell. The SQL for this is `0123`. |
| Visible saving (5, F02) | The three static "Draft saved as you go" lines are replaced by what actually happened: Saving, Saved, or a plain failure ("Your latest text is kept on this device. We will keep trying..."), with a Try again button and automatic retries (4, 12, 30 seconds). Leaving the page with unsaved text asks first. The newest text always wins over a slow older save. |
| PSYPACT parity (12, F03) | The screen's rule for "can take a client in another state by PSYPACT" now matches the database's (home-state member required, not MD/DO, virtual only, participating). Tested against the database function across seven cases. The database check at acceptance and placement is untouched. |
| Names on controls (F04, D11) | Collapsed menu buttons, the profile button and every Consult recipient radio have names (e.g. "Choose Maya Patel"); "View profile" is a separate control. |
| Long Consult lists (D10) | The "Who would you like to ask" picker shows 40 colleagues at a time with search and "Show more", keeps your picks visible, and still finds everyone. Tested with 1,200 fictional members. |
| Practice reminder wording | A member who has never set availability sees "Set your availability" with a single Set availability button, not "Reconfirm". |
| Phone legibility (D02-D07) | Phone text floor of 12px for supporting text, text boxes 16px, primary controls 44px high, long values (state, insurer, setting) full width, availability spaces and pause date stacked. The bottom-bar labels are 11px as the brief allows. |
| Demos | The Hub demo script and tour text describe the three cards and the one list, so the player matches the screen. |

## Decisions I made that you may want to change

- **Card order on the Hub is Referrals, Cover, Consult**, the same as your menu. The brief's text lists Cover first. It is one list in `homeView`; tell me if the cards should go Cover first while the menu stays as is.
- **Account pages lost the Cover and Referral counters** in their left menu (the old per-section counts are gone with the Hub counts). Their old "company notice" count moved to the bell.
- **Availability** is reached from the one-line reminder, the phone menu, the sidebar and the profile, not an always-visible Hub panel.
- **Consult dot** shows in the workspace menu and the phone bar. The account pages do not show it (they do not know about questions).

## What I tested, and what I could not

Local staging copy, fictional people only, from a production build of this branch.

- **New Release A checks (16, RA-01 to RA-16):** all pass. They cover the Hub structure, card behaviour, the counted list and its reconciliation, Later/Restore/resurface on the account, the Consult help group and its switch across devices, the reminder, the phone bar at 390 and 320, Search scopes, unread agreement across three places, the account bar at 320, save failure and recovery, names and a 1,200-member list, the PSYPACT matrix, and a forced workspace load failure.
- **Full regression:** see the results block in `acceptance_ledger.md`.
- **Phone text and target sweep:** a crawl of every page and pop-up at 320 and 390 found about 2,500 undersized items before the phone floor and about 265 after. What remains is listed under "Known gaps" in the ledger (inline person links in sentences, network diagram nodes, avatar initials, the 11px bottom labels).

Not testable here: the Cloudflare build and Worker size, a real phone, keyboard-only and screen-reader passes by a person, real email, and the Hub's in-page "could not check" message (the workspace error page, RA-16, is tested).

## What I would watch

- The Hub on a phone: whether the three stacked cards and the one line above them feel right with your thumb.
- Whether you miss the old colour, in particular the blue/terracotta rows.
- That the numbers on the three "unread" places agree on your own account.
