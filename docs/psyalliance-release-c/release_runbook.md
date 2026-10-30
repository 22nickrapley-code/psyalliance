# Release runbook: Release C (participation choices, phone alerts, groups, the public guide)

> Written for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Release C has **one SQL file** (`0125`). Everything was tested on the local copy with fictional people only; no real email, text or push was sent. Release C is the last release.

## What is being released

Branch `release-c`, delivered as one Git bundle (`psyalliance-release-c.bundle`). It needs version 14 (`c7e14b9`) in your repository. The bundle is cumulative: it contains Release A, A.1, B and C. Order: bring the bundle in, merge, run the SQL on the sandbox, deploy the sandbox, check, then the same for live.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git log --oneline -1 master
git fetch C:\Users\Nick\Downloads\psyalliance-release-c.bundle release-c:release-c
git log --oneline master..release-c
```

`git status` lists your three Cloudflare flag files (`package.json`, `package-lock.json`, `scripts/deploy-demo.mjs`); that is expected. The last command lists what is new. If Release B is already merged you will see only lines starting "Release C" (twelve). If B is not merged, you will also see seventeen "Release B" lines first (and the A.1 / A / version 15 lines before that if those are missing too). Anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only release-c
```

If it refuses, do not force it; send me `git log --oneline -3 master`.

## Step 3: SQL on the sandbox first

Supabase, project `xsfqeepxnmnvlhxwkfnw` (sandbox), SQL editor. Open `supabase/migrations/0125_participation_alerts_groups.sql`, paste all of it, Run. Expect "Success. No rows returned." (It is safe to run twice.) If you have not yet run `0124` from Release B on this project, run that first. Then the checks in `migration_and_rollback.md`.

## Step 4: the free phone alerts (optional, can wait)

Skip this step and everything else still works; the "Turn on alerts" button stays disabled.

1. Make keys: `node scripts/make-vapid-keys.mjs` (it prints two lines).
2. Cloudflare, Workers, `psyalliance-demo` (then `psyalliance`), Settings, Variables and Secrets: add `VAPID_PUBLIC_KEY` (variable), `VAPID_PRIVATE_KEY` (secret), `SUPABASE_SERVICE_ROLE_KEY` (secret, from Supabase, Project Settings, API; use the matching project each time) and `ALERT_DISPATCH_SECRET` (secret, any long random text).
3. Something has to call the sender every minute. In the Supabase SQL editor for that project (check first that `select extname from pg_extension where extname in ('pg_cron','pg_net');` returns both):

```sql
select cron.schedule('alert-sender', '* * * * *', $$
  select net.http_post(
    url := 'https://sandbox.psyalliance.org/api/alerts/dispatch',
    headers := jsonb_build_object('x-dispatch-secret', 'PASTE THE SAME ALERT_DISPATCH_SECRET HERE')
  );
$$);
```

(Use `https://psyalliance.org/...` on live.) To stop it: `select cron.unschedule('alert-sender');`. If `pg_net` is not available, tell me and I will use a Cloudflare scheduled trigger instead.

Texts need `SMS_PROVIDER=twilio` plus `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` as secrets, a paid account and (US) carrier registration. Leave them out for now.

## Step 5: sandbox site

`npm run cf:deploy:demo`, then the ten-minute check below on `https://sandbox.psyalliance.org`.

## Step 6: live

1. Same SQL on project `vvmulsyvyjsxhcpqfpyo` (live), and Step 4 again if you want alerts there.
2. `git push origin master`
3. `npm run cf:deploy`
4. The ten-minute check on `https://psyalliance.org`.

## The ten-minute check (each site)

**Public (signed out; try 390 wide too)**
- Home page: after "How it works" comes **Support at every stage of practice.** with three short lines and two links. Nothing about retired members, trainees or guaranteed results. Your Hub after sign-in has no such text.
- **Show me how PsyAlliance could help** (link in the band, or `/start`): pick "Arrange time away". An optional question appears with **Skip**. You then see "Time away, with a clearer plan" and its one-sentence benefit, **Watch the short demo**, **Try this scenario**, **Try it myself**. Try it myself: tick the handover box and see that it says acceptance alone leaves handover unfinished; press **What will they receive?**, press Interested, then **Back to my view**: your ticked box is still there. **Skip** goes to "Your starting point". No email address is requested anywhere. Press **Change my choice** and try "I'm here to offer support".
- In a demo's top bar: "Fictional practice environment", **Reset scenario** and **Change scenario**.
- Library page: the numbers read "N available to members now"; open a template that is not available yet: it says "Coming soon", not "Members get it now". No public page mentions review.
- Sign-up on a phone: the form is first.

**Handoff (use a new test account on the sandbox)**
- On `/start` choose a need and press **Continue with these choices**; create the account. On the first visit to the Hub you land on "We've used your choices to get you started" with one button for the next step, **Start fresh** and **Review in Settings**. The button opens an empty, unsent Cover / referral / question screen (or the settings, for "caseload" and "offer support"). Nothing was created or sent.

**Settings (signed in)**
- Three new folded sections. In **What would be useful**, tick two and Save, then Skip for now. In **How would you like colleagues to approach you**, press **Pause new Cover requests**: it says "Paused", the other two still say "Taking new requests". With a second test account, try to ask the first for Cover: they are excluded with "Paused new Cover requests". **Resume** puts it back. Check Availability still says the same "Confirmed N days ago".
- **Alerts on your phone**: save a phone number without ticking the box: it says to tick the box. Tick and Save: it saves. **Remove my phone number** clears it. (Turning on push needs Step 4; texts need the paid account.)

**Cover and referrals**
- Open any plan you own: **Use as a starting point** opens a new draft named "Copy of ...", with the same clients, today's default dates and nobody chosen. The original plan is unchanged. Same on a referral.

**Groups**
- As the group's creator: appoint a member as an organizer (button on their row); that member can now edit the charter and remove members, but cannot appoint anyone. An ordinary member sees no Edit or Remove. After the charter has been edited, joined members see **Earlier charters**. A member who is removed no longer sees the group.

**Links**
- Signed out, open a link like `/dashboard/cover` in a new window: after sign-in you arrive on that page, not the Hub.

**Profile and phone**
- Profile shows **Essential setup: x of 4 done** and **Optional detail: y of 8 added**.
- Phone: Library shows a **Collection** selector instead of rows of buttons; Continuity shows editing sooner.

## Rollback

The site: Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, choose the previous version, Roll back. The SQL needs no rollback after that; see `migration_and_rollback.md` for the two behaviours that remain and a complete removal script.

## Things I could not test, so please look at them

- **A real phone.** Web push was proven against a mock push service (the right signed request, no body, hidden when you have already read it, held during quiet hours, a gone device marked and not retried forever). I could not subscribe a real browser or see a real lock-screen alert. After Step 4 on the sandbox, turn alerts on in Settings on your phone (an iPhone needs PsyAlliance added to the home screen first), have a second test account send a Cover request, and tell me what you see.
- **Real text messages.** Only a mock sender was used.
- **The scheduler** (Step 4, part 3) only exists on your Supabase project.
- **The scanner-safe link rule** is covered by design (opening an alert is a normal page visit that changes nothing) and by tests that a link never changes state; no real email scanner was used.
- **Participant testing** (L10), real devices and screen readers.
