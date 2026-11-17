# PsyAlliance v17: test alert and message alerts

One SQL file: supabase/migrations/0137_v17.sql (safe to run twice). Run it on the sandbox first, then live.

## Why the sandbox never sent an alert
- Sandbox accounts are deliberately excluded from real alerts (they are demo accounts), and sandbox events only happen while the app is open, when they are read straight away. So the sandbox could never show one. The test alert below is the one exception, so you can check your phone there.

## What changed
1. Settings, Alerts on your phone: once alerts are on, a "Send me a test alert" button. Lock the phone; the alert arrives within about a minute (the sender runs every minute). One a minute at most. Works in the sandbox too.
2. New messages now alert your phone: "<First name> has sent you a message. Open message." One alert per conversation until you read it; once read, the next message alerts again. The same rule now applies to the in-app notice for messages (before, a conversation produced at most one notice a day).
3. Text alerts: the phone number and consent fields are hidden until texts are switched on (they need a paid Twilio account and US carrier registration). Numbers already saved are kept.

## Deploy (Nick)
1. Supabase sandbox project (xsfqeepxnmnvlhxwkfnw), SQL editor: paste all of supabase/migrations/0137_v17.sql, Run. Expect "Success".
2. PowerShell, in C:\Users\Nick\Documents\psyalliance:
   git fetch C:\Users\Nick\Downloads\psyalliance-v17.bundle v17:v17
   git checkout v17
   npm run cf:deploy:demo
3. On your phone, in the home-screen app: Menu, Account and privacy, Alerts on your phone, Send me a test alert. Lock the phone. Wait a minute.
4. Live: the same SQL on the live project (vvmulsyvyjsxhcpqfpyo), then
   git checkout master
   git merge --ff-only v17
   git push origin master
   npm run cf:deploy
   then the live alert setup from the v16 runbook (script with -Site live, then its SQL file).

If the test alert does not arrive, run this in the sandbox SQL editor and send me the result:
   select status, error, created_at from notification_deliveries where channel = 'push' order by id desc limit 5;

## Acceptance ledger (local)
| Item | Result |
|---|---|
| 0137 runs twice | Pass |
| Test alert queued, second within a minute refused | Pass |
| Test alert sent for a sandbox (demo) account; other demo alerts still suppressed | Pass |
| Two messages before reading: one alert; after reading, next message alerts | Pass |
| Alert wording for test and messages | Pass |
| Type check and production build | Pass |
| Real alert on an iPhone | Nick, step 3 |
