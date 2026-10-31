# PsyAlliance 1.0: release notes

1.0 brings the homepage, the trial, sign-up, the Hub, the account pages, the demos and the sandbox together as one product in one design, and fixes the correctness findings from the 31 October external review. It sits on top of Release C (the bundle contains everything since Release A). **Nothing has been deployed or pushed.**

## The look (Nick's choice, 31 October)

A's precision with B's warmth: a warm paper background, deep green, brass details. The public pages use serif (Newsreader) headlines and the app uses a crisp sans (Inter Tight for headings, Inter for text). The fonts are now loaded on every page; before this, the app fell back to whatever font the computer had. One token layer (`public/workspace/v1.css`, and the 1.0 section of `premium.css` and `account.css`) drives the workspace, the account pages, the public pages, the demos and the sandbox, so all of them match.

## What visitors will notice

- **A new homepage.** It covers, in order:
  - "Your own practice, with a group behind you."
  - "The problem", with a table comparing each moment on your own today against PsyAlliance.
  - Four career stages: starting out, building, established, changing pace.
  - The Library.
  - Rena's story (your existing text).
  - Trust, the questions, and the founding offer.

  The old lifecycle band has gone; its content is now the stages section.
- **The trial ("Show me how PsyAlliance could help").** On a computer, you pick a need on the left and see it handled on the right. On a phone, the result comes first. The specific button (for example "Start my cover plan") now keeps your choice, Reset clears the exercise, and "What will they receive?" keeps it. The privacy line now says exactly what is counted.
- **Sign-up.** The form comes first, with "What happens next" beside it. If you came from the trial, it says "Your goal: …" with a link to change it.

## What members will notice

- **Nobody lands on the old Hub any more.**
  - A member waiting for their license to be checked now gets the real Hub, with a short checklist: profile, license added, license checked, state open.
  - They can prepare cover plans, referrals and questions. The server still refuses anything that would reach a colleague until they are verified.
  - The old Home addresses redirect to the Hub. Suspended accounts go to Settings.
- **The Hub.** There is a visible greeting, with the date and which services you are open to. Search is a single field in the top bar on every page.
- **Edit profile.** A menu on the left lists the sections, each with its state, and one section shows at a time. Every field is still in the one form, so one Save covers all of them. Leaving with unsaved changes asks first.
- **Quick start (import).**
  - It now accepts a link to your Psychology Today profile as well as pasted text.
  - It strips the menus and footers out of a pasted web page.
  - If the configured AI model name has been retired, it tries the current one.
  - When it fails, it says why in plain words.
- **Network.** Trusted colleagues, Worked with before and Suggested sit side by side in three columns on a computer, and stack on a phone.
- **@mentions** in Messages (one-to-one and group conversations), Consult replies and group discussions.
  - Type @ and pick someone from those who can already see the conversation.
  - They get a notification ("mentioned you") that opens that message or discussion.
  - Being mentioned never adds anyone to a conversation.
  - Mentions are in-app only (the bell and Notifications), with no email.
- **Continuity plan.** Unsaved changes are kept on your device and put back, and leaving with unsaved changes asks first. The note now says a section is saved when you press Save.
- **Smaller fixes:**
  - Matching leaves out colleagues who have paused or closed that service, and says why.
  - The Cover send count is exact.
  - The save warning says what failed, and how to sign in again if you were signed out.
  - Collaboration counts agree between the profile and Network.
  - Spelling is US (license, organizer).
  - Group message authors' names open their profiles.
  - The "Closing or reducing practice" Cover reason no longer implies a permanent placement.

## Behind the scenes

- **Phone alerts were rebuilt:**
  - Each alert carries its own event and link.
  - Each device has its own delivery attempt.
  - Claims are leased, so two dispatchers never send the same alert twice.
  - Consent and quiet hours are checked again at the moment of sending.
  - Push addresses are limited to the real push services.

  **The setting stays hidden** until `PHONE_ALERTS=on` is set, which should happen only after testing on a real iPhone and Android phone.
- **Security update:** Next.js 15.5.28 and sharp 0.35.5 (advisory GHSA-2464-fhr4-w9xw).
- **Analytics:** a visitor can no longer write the "real" analytics namespace. Opening a demo and finishing an exercise are now recorded separately.

## Not in 1.0 (said plainly)

- **Directory performance at much larger scale (review F16) and the database-warning audit (F18)** are a later pass, as agreed.
- **Phone alerts** have only been tested against a mock push service. Real-phone testing is still needed before switching them on.
- **The quick-start import** needs the AI key on the deployment. I could not see why it failed on your site; the log line would confirm it.
- **Psychology Today may block automatic page fetches.** If it does, the import asks you to paste the text instead.
- **Mention emails** are not sent.
- **Not tested:** a physical phone, a screen reader, or real participants.
