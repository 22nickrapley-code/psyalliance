# PsyAlliance v3: written designs (not built)

Nick asked for written designs only for these three areas on 5 Nov. Nothing here is in the code yet. Each section says what the member sees, the rules, what we would build, and what has to be decided first.

## 1. Sharing and phone alerts

### What the member sees
- **Share a request with a colleague who is not on PsyAlliance yet.** From a referral or cover plan, "Share with someone outside PsyAlliance" gives a link and a short message to copy. The link opens a public page that shows only what an invitation shows today: the focus, the state, the setting and the timeframe. No client detail, no names beyond the sender's first name. Opening it leads to sign-up; the request is waiting for them once they are verified.
- **Phone alerts.** Settings already has "Alerts on your phone" (push on the web app, text messages behind a switch). The alert says only that something is waiting: "Avery sent you a referral request. Review request." Tapping it opens the app at the right record.

### Rules
- An alert never contains a client detail, a focus, or anything clinical. Only a first name, the kind of request and a link.
- Text messages are opt-in per member, with a confirmed number, quiet hours (default 9 pm to 8 am in the member's time zone) and a daily cap (default 5). STOP always works.
- A shared link expires with the request (deadline passed, placed, withdrawn) and can be revoked. It never widens the audience the sender chose: a link from a "selected colleagues" request only lets the named person in.
- Every share and every alert is logged in the request history.

### What we would build
- `request_shares` table (request, created_by, token hash, expires_at, revoked_at, opened_at, joined_profile_id).
- A public route `/r/[token]` showing the safe summary and a sign-up button.
- SMS through one provider (Twilio or Vonage) behind a server-only key, with delivery receipts written to `notification_deliveries` (channel `sms`).

### To decide first
- Provider and budget for texts (roughly 1 cent per US text).
- Whether a non-member can be named on a selected-colleagues request before they join, or only after.
- Whether texting needs a BAA. Alerts carry no health information by design, so the answer is probably no, but it should be checked with counsel.

## 2. Smart requests and first-week value

### What the member sees
- **Smart requests.** When a member writes a referral or cover need in their own words ("evening telehealth for a teenager with anxiety, NY, Aetna"), PsyAlliance proposes the structured fields: focus, age group, state, setting, insurance, timeframe. The member checks each one before anything is saved. Nothing is sent automatically.
- **Identifier guard.** The same step flags anything that looks like a name, date, phone number or address and asks the member to remove it. This uses the de-identification check the app already has.
- **First-week value.** In a new member's first week the Hub shows three short, real tasks in order: confirm availability, add three trusted colleagues, try one request in the sandbox. Each one finishes in under two minutes and is ticked off from the records, not from clicks.

### Rules
- The suggestion only fills fields from the existing controlled lists. A word that does not match a list value is shown as "Not matched" for the member to choose.
- The free text the member typed is not stored once the fields are confirmed.
- Matching rules stay the same. Smart requests change how a request is written, not who receives it.

### What we would build
- A server handler `request.suggest` that sends the de-identified text to the model and returns field proposals, with a fixed prompt and a schema check on the answer.
- A "Suggested" chip on each proposed field in the existing referral and cover forms, with Accept and Change.
- The first-week list is computed from existing records (availability confirmed date, trusted count, sandbox activity).

### To decide first
- Which model and data-processing terms. The text is de-identified before it is sent, but the terms still need to say it is not kept or used for training.
- Whether the suggestion is on by default or a button ("Fill from my description").

## 3. The practice assistant (phased AI)

Nick asked for an opinion as well as a design.

### Opinion
A chat assistant in the Hub is worth doing, but only after the request flows are settled, and only in small steps. The risk is not the technology. The risk is an assistant that sounds confident about a colleague's availability or a state rule and is wrong. So each phase should only answer from PsyAlliance's own records and the Library, say where every answer came from, and hand off to the real screen for anything that changes something. I would not let it send anything on a member's behalf in the first two phases.

### Phases
1. **Find and explain (read only).** "Who in my network covers child anxiety in MA?" or "What does the reciprocal coverage agreement cover?" It answers from the directory, the member's own plans and referrals, and the Library, with a link to each source. It cannot change anything.
2. **Prepare (drafts only).** "Set up cover for my leave from 2 to 20 March." It opens a pre-filled draft in the normal Cover screen for the member to review and send. The member presses Send, never the assistant.
3. **Remind and summarise.** A weekly summary in the Hub: what is waiting, what is about to expire, who replied. It uses the notifications the app already sends.
4. **Act with confirmation (later, only if phases 1 to 3 are trusted).** Small actions such as "reconfirm my availability" with a clear confirmation step.

### Rules for every phase
- No client-identifying information goes in or comes out. The de-identification check runs on every message.
- Answers cite their source (a profile, a plan, a Library page). If there is no source, it says it does not know.
- It never gives clinical, legal or billing advice. The Library's "Before you use it" notes stay the authority.
- Everything it does is visible in the member's own history.

### To decide first
- Model provider and data terms (same question as smart requests).
- Whether phase 1 is open to every member or a small group first. A small group first is the safer choice.

## Where the GPT review differs from Nick's direct feedback

Outstanding. Nick asked for a list of anything in the GPT review that contradicts his direct feedback. That cross-check was not finished in this pass, so no list is given here rather than a guessed one. Where the build had to choose, it followed Nick's answers of 5 Nov (see the v3 decisions doc).
