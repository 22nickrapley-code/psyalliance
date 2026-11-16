# PsyAlliance v14: release runbook

v14 = v13 + Nick's 16 Nov phone review and the Terms changes. **There is no new SQL in v14.** If v13's `0136_v13.sql` isn't on a project yet, run it there first.

## Steps (PowerShell, in your psyalliance folder)

1. Bring in the bundle:

   ```powershell
   git fetch $HOME\Downloads\psyalliance-v14.bundle v14:v14
   git log --oneline master..v14
   git checkout master
   git merge --ff-only v14
   ```

   The merge should say "Fast-forward".

2. Deploy sandbox:

   ```powershell
   npm run cf:deploy:demo
   ```

3. On your iPhone, open a new sandbox link and run through the acceptance ledger.

4. Deploy live:

   ```powershell
   git push origin master
   npm run cf:deploy
   ```
