# PsyAlliance v13: release runbook

v13 = v12 + Nick's 15 Nov list + the user test of 15 Nov + the security pass. The bundle includes everything since v6.

## 1. Bring in the bundle (PowerShell, in your psyalliance folder)

```powershell
git fetch $HOME\Downloads\psyalliance-v13.bundle v13:v13
git log --oneline master..v13
git checkout master
git merge --ff-only v13
```

The log should show v13 (and v12 if you haven't merged it yet). The merge should say "Fast-forward".

## 2. SQL on sandbox

Run `psyalliance-v13-0136_v13.sql` in the sandbox project's SQL editor. If v12's `0135_v11.sql` isn't on sandbox yet, run that first.

## 3. Deploy sandbox

```powershell
npm run cf:deploy:demo
```

## 4. Check on sandbox

Use a new sandbox link and run through the acceptance ledger.

## 5. SQL on live

Run `0136_v13.sql` on the live project.

## 6. Deploy live

```powershell
git push origin master
npm run cf:deploy
```

## 7. Check on live

- The homepage shows Rena's photo and the new verification line.
- Sign-up shows the new founding-member line.
- Clicking a plan in the Cover calendar opens it.

**Cloudflare:** if you haven't disconnected the automatic Git build yet, the red "build failed" will appear again after the push. It is harmless. Don't press Retry.
