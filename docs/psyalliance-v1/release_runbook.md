# Release runbook: PsyAlliance 1.0

> Written for Nick. **Claude has not pushed or deployed anything, and has run no SQL on either Supabase project.** Everything was tested on the local copy with fictional people only. No real email, text or push was sent.

## What is being released

Branch `v1`, delivered as one Git bundle (`psyalliance-v1.bundle`). It needs version 14 (`c7e14b9`) in your repository. It is cumulative: it contains Release A, A.1, B, C and 1.0, so it works whether or not Release C is already merged. The order is: bring the bundle in, merge, install, run the SQL on the sandbox, deploy the sandbox, check it, then do the same for live.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git fetch C:\Users\Nick\Downloads\psyalliance-v1.bundle v1:v1
git log --oneline master..v1
```

`git status` lists your Cloudflare flag files (`package.json`, `package-lock.json`, `scripts/deploy-demo.mjs`). That is expected. The last command lists what is new. If Release C is already merged, you will see only lines starting "1.0" (sixteen of them). If Release C is not merged, you will see the "Release C" lines (and earlier ones) before them. If you see anything else, stop and tell me.

## Step 2: merge, keeping your flag files

1.0 updates `package.json` and `package-lock.json` (a security update to Next.js and sharp), so put your local changes aside first, then put them back:

```
git diff > ..\my-cloudflare-flags.patch
git stash
git checkout master
git merge --ff-only v1
git stash pop
npm install
```

- `git diff` saves a copy of your flag changes next to the project folder, just in case.
- If `git stash pop` says **CONFLICT in package-lock.json**, type these three lines:

  ```
  git checkout HEAD -- package-lock.json
  npm install
  git stash drop
  ```

- If it says CONFLICT in `package.json` or `deploy-demo.mjs`, stop and send me what it printed. Your changes are safe in the stash and in the patch file.
- If `git merge` refuses, do not force it. Send me `git log --oneline -3 master`.

`npm install` is needed either way, because the Next.js version changed.

## Step 3: SQL on the sandbox first

In Supabase, open project `xsfqeepxnmnvlhxwkfnw` (the sandbox), then the SQL editor. For each file below, open it in `supabase/migrations/`, paste all of it, and press Run. Each should say "Success. No rows returned." Every file is safe to run twice, so if you are unsure whether you ran one before, run it again.

1. `0123_unread_message_count.sql` (Release B)
2. `0124_message_history_and_first_unread.sql` (Release B)
3. `0125_participation_alerts_groups.sql` (Release C)
4. `0126_practice_scenarios.sql` (Release C)
5. `0127_v1_corrections.sql` (**new in 1.0**)

Then run the check in `migration_and_rollback.md`. If a page later says "That didn't save" for something new, run `notify pgrst, 'reload schema';` once.

## Step 4: settings on the Worker (Cloudflare)

- **Leave `PHONE_ALERTS` unset.** Phone alerts stay hidden until they have been tried on a real iPhone and Android phone. When you want them, set `PHONE_ALERTS` to `on` on the sandbox Worker first (plus the Release C alert settings).
- `ANTHROPIC_API_KEY` must be set on both Workers for quick start (profile import). This is the most likely reason quick start failed for you. Check it is there under Workers, `psyalliance-demo` (then `psyalliance`), Settings, Variables and Secrets.
- `ANTHROPIC_MODEL` is optional. If it is set to an old model name, quick start now falls back to a current model by itself. You can delete it.

## Step 5: sandbox site

```
npm run cf:deploy:demo
```

Then do the check below on `https://sandbox.psyalliance.org`.

## Step 6: live

1. Run the same five SQL files on project `vvmulsyvyjsxhcpqfpyo` (live).
2. `git push origin master`
3. `npm run cf:deploy`
4. Do the check below on `https://psyalliance.org`.

## The fifteen-minute check (each site)

**Look (any page).** The text is Inter, headings on public pages are a serif, and the colours are deep green on warm paper. If a page still looks like the old grey-green style, press Ctrl+F5 once (old cached files).

**Homepage, signed out (try it on your phone too)**
- The headline is "Your own practice, with a group behind you." There are two buttons: **Create your account** and **Show me how it could help**.
- Scrolling down, you see: The problem (a table, "On your own today" against PsyAlliance), four career stages, the Library, Rena's story, trust and verification, questions, and the founding offer.
- Nothing scrolls sideways on a phone.

**The trial ("Show me how it could help", or `/start`)**
- On a computer: needs on the left, the answer on the right. Pick "Arrange time away": the right side asks "Which describes you best?".
- On a phone: the answer is shown above the list.
- Go through to **Try it myself**, tick the box, press **What will they receive?**, then go back: your tick is still there. **Reset** clears it.
- At the end, the one task button (for example **Start my cover plan**) leads to sign-up, which says "Your goal: Arrange time away." with a Change link.
- **Watch the short demo** opens the demo, which has the same look.

**Sign-up.** The form is on the left, with "What happens next" beside it.

**A new account waiting for its license check (use a sandbox test account)**
- It lands on the real Hub, not the old one. Near the top it shows a short checklist (profile, license added, license checked, state open) and "While you wait: watch the demos, open the Library or finish your profile".
- Trying to send a Cover request to a colleague is refused until the account is verified.

**The Hub, signed in.** The greeting and date are visible at the top. Search is one wide field in the top bar ("Search colleagues, referrals, cover, consults, Library"). Clicking it opens Search.

**Edit profile** (Profile, then Edit)
- A menu on the left lists the sections, each marked Done, To add or Optional. Only one section shows at a time. **Next: ...** moves on.
- Change something, then click Network in the sidebar: it asks before leaving. **Save** keeps every section.
- **Quick start**: paste your Psychology Today profile link and press **Fill in from this link**. The filled-in sections say "Filled in". If it fails, it now says why in plain words. If it says "We couldn't open that page", paste the profile text instead. If it fails another way, send me the message and the Cloudflare log line (Workers, `psyalliance`, Logs, at the time you pressed it).

**Network.** On a computer: Trusted colleagues, Worked with before and Suggested are side by side in three columns. On a phone they stack.

**@mentions (two test accounts)**
- In Messages, open a conversation with the other account and type `@`. A list of the people in that conversation appears. Pick one with Enter or a click. Send it.
- The other account gets a bell notification, "mentioned you", which opens that message.
- Do the same in a Consult reply and in a group discussion.
- No email is sent for a mention.

**Settings.** There is no "Alerts on your phone" section (hidden until `PHONE_ALERTS=on`).

**Continuity plan.** Type in a section without saving and reload: the text comes back with a note. Leaving asks first.

## Rollback

The site: in Cloudflare, open Workers and Pages, then `psyalliance` (and `psyalliance-demo`), then Deployments. Choose the previous version and press Roll back. The SQL can stay; see `migration_and_rollback.md`.

## Things I could not test, so please look at them

- **Quick start with the real AI key.** I could not see why it failed on your site. The Cloudflare log line at that moment would tell us.
- **Whether Psychology Today lets the server open a profile page.** If it blocks automatic fetches, the link option will say so, and pasting the text still works.
- **A real phone, a screen reader, or real participants.**
- **Phone alerts** have only been tested against a mock push service, which is why they stay hidden.
