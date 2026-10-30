# Release runbook: Release A (Hub, palette, navigation, correctness)

> Written 29 Oct 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Release A has **one small SQL file** (`0123`, a read-only function). Everything was tested on the local staging copy (fictional people only). Release B and C have not been started.

## What is being released

Branch `release-a`, delivered as one Git bundle (`psyalliance-release-a.bundle`). It needs version 14 (`c7e14b9`) in your repository, which it is. The bundle also contains version 15's four commits, in case version 15 is not in your `master` yet.

The order is: bring the bundle in, merge, run the SQL on the sandbox, deploy the sandbox, check, then the same for live.

## Step 1: bring the bundle in (PowerShell)

```
cd C:\Users\Nick\Documents\psyalliance
git status
git log --oneline -1 master
git fetch C:\Users\Nick\Downloads\psyalliance-release-a.bundle release-a:release-a
git log --oneline master..release-a
```

- `git status` will list three changed files (`package.json`, `package-lock.json`, `scripts/deploy-demo.mjs`): your Cloudflare flag edits. That is expected and the merge does not touch them.
- The last command lists the commits that are new to `master`. If version 15 is already in `master`, you will see **eight** lines, all starting "Release A (part". If not, you will see **twelve**: four "Version 15" lines and the eight Release A lines. Anything else, stop and tell me.

## Step 2: merge

```
git checkout master
git merge --ff-only release-a
```

If `git merge` says it cannot fast-forward, `master` is not where I expected (for example still version 13, `d96a497`). Do not force it: run `git merge --ff-only followup-old-vs-new` first (version 14), then `git merge --ff-only release-a`. If that still refuses, tell me.

## Step 3: SQL on the sandbox first

Supabase, project `xsfqeepxnmnvlhxwkfnw` (sandbox), SQL editor. Open `supabase/migrations/0123_unread_message_count.sql` from the repository, paste all of it, Run. Expect "Success. No rows returned." Then:

```sql
select to_regprocedure('public.my_unread_message_count()');
```

It should show `my_unread_message_count()`, not empty. (Both projects already have the version 14 SQL; I checked on 29 Oct, so nothing else is needed.)

## Step 4: sandbox site

`npm run cf:deploy:demo` (the way you did for versions 14 and 15). Then the ten-minute check below on `https://sandbox.psyalliance.org`.

## Step 5: live

1. Same SQL on project `vvmulsyvyjsxhcpqfpyo` (live).
2. `git push origin master`
3. `npm run cf:deploy`
4. The ten-minute check on `https://psyalliance.org`.

## The ten-minute check (each site)

Use your own account, and a phone (or the browser narrowed to a phone) for the second half.

**The Hub**
- Top of the page: your greeting and one line, **"N things need your attention"** (or "You're up to date"). No big banner, no coloured blocks.
- Click that line: the full list opens right there with **Collapse**. Rows say what to do, which anonymous client or plan, which colleague, any real due date, and have one button. Nothing is picked for you as "the next step".
- On one row press **Later**: it moves to a "Set aside" list and the number drops by one. Press **Restore**: it comes back. Reload the page, or open the site on another device: the same tasks are still set aside. The work itself is untouched and still open.
- Under that: **three plain white cards** in one row: Referrals (Refer a client), Cover (Plan cover), Consult (Ask a question). The cards follow the menu order you chose. Each card is one big button. No counts, no little buttons inside. Click each: the matching pop-up opens, and nothing else navigates.
- A small **Invite a colleague** link near the cards. Copying the text sends nothing.
- If your availability needs re-confirming: a separate one-line reminder with a one-tap confirm. It is not counted as client work.
- If someone recently asked a Consult question that fits your specialisms: a separate, uncounted "Questions you could help with" group, and a small dot on **Consult** in the menu (cleared when you visit Consult). Switch it off in Settings, Notification preferences, "Questions you could help with".

**Left menu (desktop)**: The Hub, **Referrals, Cover, Consult**, Network / Search, Messages, Library. (Referrals first, as you decided; the brief listed Cover first.)

**Search**: the **Search** button in the top bar opens a window with scopes: All, Colleagues, Referrals, Cover, Consult, Messages, Library. Pick one and the results narrow to it. On "Colleagues" there is a link to Network / Search for filters.

**Messages count**: if you have unread messages, the number on Messages in the left menu, the phone bar, and the left menu on the Profile / Settings / Documents pages are **the same number**. Company notices and other notifications are on the bell, not in that number.

**Phone (390 wide, then 320)**
- Bottom bar, always these five, in this order: **Hub, Referrals, Cover, Consult, Messages**. Fully visible at 320. Same bar on Profile, Settings, Documents, Credentials. No "More".
- **Search** is a clearly named button in the top bar, on every page.
- Hub: the three cards are stacked, full width, text readable (no tiny labels).
- Text boxes on a phone use 16px text, so the phone does not zoom in when you tap one.

**Saving**: start a Cover plan or a referral, type a few words and watch the footer: "Saving..." then "Saved". (To see the failure message: switch the device to airplane mode while typing. It says your latest text is kept here and will retry, and clears when you reconnect.)

**Colours**: forest green, sage and cream, white cards, thin borders. The strong blue/terracotta rows and coloured area fills from version 15 are gone. Service colours remain only in small icons and the pop-up buttons.

**Library**: unchanged by this release. On the live site, templates still read "Coming soon" until you mark each one reviewed (your Library review task); the sandbox shows all 20.

## Rollback

The site: Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, choose the previous version, Roll back. About a minute.

The SQL needs no rollback after a site rollback (the previous site never calls it). If you want it gone anyway: `drop function if exists public.my_unread_message_count();`.

## Things I could not test, so please look at them

- **Cloudflare build and Worker size.** Your `--dangerouslyUseUnsupportedNextVersion` flag edits stay in your local files; if the Worker size is over the limit, tell me before deploying anything further.
- **A real phone.** Everything on phones was tested in a phone-sized browser. Please look at the Hub, the pop-ups and typing on an actual iPhone and Android.
- **Keyboard-only and screen-reader use**: checked for names and focus by automatic tests, not by a person.
- **A failed load.** If the workspace cannot load, you now get a plain "We could not load your workspace" page with Try again (tested by forcing a database error). Inside the Hub there is a second message, "We could not check what needs your attention", for the unlikely case the page arrives without its lists; I could not make that happen in tests.
- **Real email.** Not part of Release A. (You are setting up the provider before Release B.)
