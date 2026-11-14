# PsyAlliance v11: release runbook

v11 is a small desktop polish round on top of v10 (Nick's 13 Nov notes). It has no SQL of its own.

## Before you start

- If you have not finished the v10 deploy, that's fine: this bundle contains v10 as well. Just make sure the v10 SQL (`0134_v10.sql`, plus `0132_v6.sql` and `0133_v9.sql` if not yet run) has been run on sandbox before step 3 and on live before step 5.
- If v10 is already live, there is no SQL to run for v11.

## Steps (PowerShell, in your psyalliance folder)

1. Bring in the bundle:

   ```powershell
   git fetch $HOME\Downloads\psyalliance-v11.bundle v11:v11
   git log --oneline master..v11
   ```

   The v11 commit should be at the top.

2. Merge it:

   ```powershell
   git checkout master
   git merge --ff-only v11
   ```

   It should say "Fast-forward".

3. Deploy to sandbox: `npm run cf:deploy:demo`

4. Open a new sandbox link and check the list in the acceptance ledger (all on desktop).

5. Deploy to live:

   ```powershell
   git push origin master
   npm run cf:deploy
   ```

6. Spot-check live: the Hub cards and a Network search page.
