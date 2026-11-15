# PsyAlliance v12: release runbook

v12 = v11 (Nick's 13 Nov desktop tweaks) + the fixes from the release QA review of 13 and 14 Nov. This bundle includes v10 and v11 too, so you only need this one.

## 1. Bring in the bundle (PowerShell, in your psyalliance folder)

```powershell
git fetch $HOME\Downloads\psyalliance-v12.bundle v12:v12
git log --oneline master..v12
git checkout master
git merge --ff-only v12
```

The log should show v12 at the top. The merge should say "Fast-forward".

## 2. SQL on sandbox

In the Supabase SQL editor for the sandbox project, run any of these that you haven't run yet, in this order: `0132_v6.sql`, `0133_v9.sql`, `0134_v10.sql`. Then run `0135_v11.sql`. See the migration note for checks.

## 3. Deploy sandbox

```powershell
npm run cf:deploy:demo
```

## 4. Check on sandbox

Open a new sandbox link and run through the acceptance ledger.

## 5. SQL on live

Run the same files on the live project.

## 6. Deploy live

```powershell
git push origin master
npm run cf:deploy
```

## 7. Check on live

Quick checks: save a guide to My Files, open a cover notification and click around Cover, and read the Terms founding paragraph.
