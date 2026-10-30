# Release A: migration, compatibility and rollback notes

Written 29 Oct 2026. Nothing has been pushed or deployed, and no SQL has been run on either Supabase project. Everything below was tested on the local staging copy (fictional people only).

## Starting point

- Source: branch `release-a`, created from version 15 (`22a0c35`, the baseline named in the brief) and built on `c7e14b9` (version 14). Four Release A commits sit on top of version 15's four.
- Database: on 29 Oct a read-only check of both Supabase projects (live `vvmulsyvyjsxhcpqfpyo`, sandbox `xsfqeepxnmnvlhxwkfnw`) found the version 14 SQL (0122) already in place on both (`workspace_year` and `workspace_profile_signals` exist) and nothing from Release A. So **the only SQL for Release A is `0123`.**
- Which code is live: I cannot see this from here (the Cloudflare dashboard is yours). The runbook handles both cases (version 14 live, or version 15 live).

## The one database change: `0123_unread_message_count.sql`

| | |
| --- | --- |
| What it adds | One function, `public.my_unread_message_count()`. It counts messages written by someone else, not deleted, newer than your last read of that conversation, and (in groups) not from someone you blocked. This is the exact rule the workspace already used. |
| What it does not touch | No table, column, row, policy or existing function. It reads only. |
| Who can call it | Signed-in members (`authenticated`). Revoked from `public` and `anon`. It can only ever count the caller's own messages (`auth.uid()`). |
| Why | Finding F01. The workspace counted unread messages; the account pages (Profile, Settings, Documents...) counted conversations with any activity plus company notices, so the same member saw different numbers. Now all three places (workspace, account pages, phone bar) use this one number. Notifications and company notices are counted separately, on the bell. |
| Dependencies | `conversation_messages`, `conversation_participants`, `public.is_blocked_between`. All three exist on both projects (checked 29 Oct). |
| Safe to run twice | Yes (`create or replace`). |
| Order | Sandbox first, then live. It does not matter whether you run it before or after the site deploy (see "Compatibility"). |

Run it in the Supabase SQL editor: open `supabase/migrations/0123_unread_message_count.sql`, paste the whole file, Run. Then check:

```sql
select public.my_unread_message_count();            -- run signed in: returns a number (0 or more)
select to_regprocedure('public.my_unread_message_count()');   -- returns the function name, not null
```

(The SQL editor runs as the project owner, so the first line returns 0 there because there is no signed-in member; the second line is the real check.)

### If a new function does not seem to take effect

Supabase reloads its API cache by itself after SQL like this. If the account pages still show the older count a few minutes after running 0123, run `notify pgrst, 'reload schema';` once. During my local run this was the only thing needed.

## What Release A stores, and where

| Thing | Where | New SQL? |
| --- | --- | --- |
| Set aside tasks (Later), "Not for me" on a Consult question, the "Questions you could help with" switch, "last seen" marker for the Consult dot | The existing `workspace_drafts` table, as one row per member (`kind = 'hub-state'`), written through the existing `save_workspace_draft` function | No. That function accepts any kind and has a 400 KB limit; set-aside entries clean themselves up when the task is gone, "not for me" keeps the last 300. |
| Hub open/closed | The browser tab (sessionStorage), per tab | No |
| Search scope chosen | In memory only | No |

If saving fails (offline, signed out), the Hub puts the list back as it was and says "That didn't save, so nothing was changed. Please try again." Nothing is left half-saved.

## Compatibility

- **Site before SQL (or SQL never run).** The account layout asks for `my_unread_message_count()`; if it is missing it falls back to the previous count and carries on. Nothing errors. The only visible difference is that the account pages and the workspace can disagree again until the SQL is run.
- **SQL before site.** The old site never calls the function. No effect.
- **Old bookmarks and routes.** No route was removed or renamed. `/dashboard`, `/dashboard/cover`, `/dashboard/referrals`, `/dashboard/consult`, `/dashboard/network`, `/dashboard/messages`, `/dashboard/library` and the account pages are unchanged. Library, Network / Search and Notifications remain reachable from the left menu on desktop and from the menu or profile on a phone.
- **Existing drafts, plans, referrals, questions and messages.** Not migrated, not reset. Nothing in Release A rewrites a stored record. Choices saved by earlier Hub builds ("Not now" on a step, dismissed cards) stay stored and untouched; the new Hub simply does not use them, so the first time a member opens it every open task is in the active list and nothing is set aside.
- **Style files.** The new palette is one extra stylesheet, `public/workspace/restrained.css`, loaded last on the workspace and the account pages. `bold.css` (version 15's strong colour fills) is no longer loaded and has been deleted from the repository. Browsers fetch the new files because the style links carry a new version tag (`?v=16`).

## Rollback

| What went wrong | What to do | Effect |
| --- | --- | --- |
| The new site looks or behaves wrongly | Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, pick the previous version, Roll back. About a minute. | Everything visual and behavioural returns to the previous version. |
| You want the SQL gone too | Run `drop function if exists public.my_unread_message_count();` | The previous site never uses it, so you can leave it in place: it is harmless. After a code rollback you do not need to remove it. |
| Members' Hub choices | Nothing to undo. | The previous Hub ignores the saved choices; they are kept and used again if Release A is deployed again. |

There is no data to restore because Release A changes no existing data.

## What this release deliberately does not change

No change to matching, eligibility, outreach, scheduling, placement, messages, the Library review gate, signup, terms, or any permission or policy. The PSYPACT (F03) fix is in the browser only (it now applies the same rule the database already enforced); the database's own check at acceptance and placement is untouched and still runs.
