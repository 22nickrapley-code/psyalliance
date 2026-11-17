# PsyAlliance v16: alerts on your phone

No database changes in the code. One short piece of SQL per site, made for you by the script.

## What changed
- PsyAlliance can be added to a phone's home screen as an app: its own icon (the green and cream mark), opens full screen at the Hub.
- That is what an iPhone needs before it allows alerts (iOS 16.4 or later). Android works in Chrome either way.
- The Settings help line now tells iPhone users exactly how: Safari, Share, Add to Home Screen, open it from there, sign in, turn alerts on.
- Everything else was already built: every in-app notification also goes to the phone, respecting quiet hours, and the alert text is fetched only after the phone checks you are signed in (nothing clinical travels through Apple or Google).

## What you do (about 15 minutes)
1. Deploy v16 to the sandbox as usual:
   git fetch C:\Users\Nick\Downloads\psyalliance-v16.bundle v16:v16
   git checkout v16
   npm run cf:deploy:demo
2. Switch alerts on for the sandbox (same folder, PowerShell):
   powershell -ExecutionPolicy Bypass -File docs\psyalliance-v16\setup-phone-alerts.ps1 -Site demo
   It asks for the Supabase service_role key of the sandbox project (Supabase, Project Settings, API Keys). Paste it, or press Enter if you know it is already set.
3. Open Downloads\psyalliance-alerts-demo.sql, paste it into the Supabase SQL editor for the sandbox project, Run. Then delete the file.
4. On your iPhone: open sandbox.psyalliance.org in Safari, Share, Add to Home Screen. Open it from the home screen, enter the sandbox, go to Settings, Turn on alerts, Allow.
5. Test: lock the phone and wait for the next sandbox colleague event (about seven minutes). An alert should arrive.
6. When happy, live: `npm run cf:deploy`, then steps 2 and 3 with `-Site live` and the live project, then step 4 on psyalliance.org.

If step 2 says Cloudflare refused, run `npx wrangler login` once and repeat.
If the SQL says pg_net is not available, tell me and I will switch to a Cloudflare timer instead.

## Notes
- The home-screen app keeps its own sign-in, separate from Safari, so you sign in once inside it.
- Alerts are per device: turn them on on each phone or computer.
- Text-message alerts stay off (they need a paid Twilio account).

## Acceptance ledger
| Item | Result |
|---|---|
| /manifest.webmanifest served, standalone, start at /dashboard | Pass |
| manifest, apple-touch-icon, web-app tags on public, account and workspace pages | Pass |
| Icons 180, 192, 512, maskable 512 | Pass |
| iPhone help text in Settings | Pass |
| Push sender, quiet hours, subscription checks | Unchanged (built in Release C) |
| Real alert on an iPhone | Nick to check (step 5) |
| Type check, production build | Pass |
