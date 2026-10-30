# Release B: migration, compatibility and rollback notes

Written 30 Oct 2026. Nothing has been pushed or deployed, and no SQL has been run on either Supabase project. Everything below was tested on the local staging copy (fictional people only).

## Starting point

- Source: branch `release-b`, built on `release-a1` (tip `f328ea1`), which is built on `release-a`. Release B is twelve code commits on top of A.1, plus one for these notes.
- Database: on 29 Oct a read-only check found the version 14 SQL (0122) on both Supabase projects. Release A added `0123` (unread count). Release B adds `0124`. If you have not yet run `0123` on a project, run it first (it is in the Release A runbook); `0124` does not depend on it.
- **The only SQL for Release B is one file, `0124_message_history_and_first_unread.sql`.** It has two parts, each independent of the other, both safe to run twice.

## The one database change: `0124_message_history_and_first_unread.sql`

### Part 1: search every message (new function, reads only)

| | |
| --- | --- |
| What it adds | One function, `public.search_message_history(p_query text, p_before bigint default null, p_limit integer default 20)`. It returns the signed-in member's own messages that contain every word of the search (any order, case ignored), newest first, 20 at a time (1 to 50 allowed), with a short piece of text around the match, the conversation's key, the message's id and when it was sent. A "more" flag tells the screen there is another page. |
| Who can see what | Exactly what the workspace already allows. Only conversations the caller takes part in. Messages the author deleted are never returned. A two-person conversation with someone the caller has blocked (or who blocked the caller) is not searched. In a group, messages from people the caller has blocked are left out (the caller's own are kept). |
| What it does not touch | No table, column, row or policy. |
| Who can call it | Signed-in members (`authenticated`). Revoked from `public` and `anon`. It can only ever search the caller's own conversations (`auth.uid()`). |
| Searching text | Each word is matched as plain text. A `%` or `_` typed in the search is a literal character, not a wildcard. At most six words are used. Fewer than two characters returns nothing. |
| Why | Brief section 9 and M01: "older-message search opens the exact context and message". Release A searched only each conversation's name and latest message and said so on the screen. |
| Dependencies | `conversation_messages`, `conversation_participants`, `conversations`, `public.is_blocked_between`. All exist on both projects (the same ones `0123` uses). |

### Part 2: the first message in a new conversation counts as unread (one function replaced)

| | |
| --- | --- |
| The defect | A conversation about a referral or a cover client is created in the same step as its first message (for example when a colleague presses "Discuss first" on a referral). The other person's read marker and that message were both stamped with the same instant, and "unread" means "newer than the read marker", so that first message was **never counted as unread** for the person it was meant for (the bell and email still told them). Found by the new message-contexts test (MB-10). |
| What it changes | It replaces one existing function, `private.context_conversation`, with the same body except that a person added to a *new* conversation is given a read marker of one millisecond before now instead of now. Nothing else in the function changes: same arguments, same result, same permissions (`revoke` from `public`, `anon`, `authenticated` is repeated). |
| What it does not touch | No table, column, policy or other function. Conversations that already exist and their read markers are not changed and nothing is rewritten. Direct conversations are unaffected in practice (they are opened before the first message is sent). |
| Effect on counts | From then on the first message of a new referral or cover conversation is unread for the recipient: the number on Messages, the account pages and the phone bar all use the same rule, so all three go up by one. A member who has been waiting on such a first message will see it as unread only for conversations created after this SQL runs. |
| Dependencies | The tables used by `0117` (the function's original home). Nothing new. |

### Running it

Safe to run twice (`create or replace`, then `revoke` and `grant`, which can be repeated). Sandbox first, then live. It does not matter whether you run it before or after the site deploy (see "Compatibility").

Open `supabase/migrations/0124_message_history_and_first_unread.sql` in the Supabase SQL editor, paste the whole file, Run. Expect "Success. No rows returned." Then run these two checks:

```sql
select to_regprocedure('public.search_message_history(text,bigint,integer)');
select position('1 millisecond' in pg_get_functiondef('private.context_conversation(text,text,uuid[],uuid,uuid,text,timestamptz)'::regprocedure)) > 0 as first_message_fix_in_place;
```

The first should show `search_message_history(text,bigint,integer)`, not empty. The second should show `true`. (The SQL editor runs as the project owner with no signed-in member, so calling the search function there raises "Please sign in again." That is correct; the real test is in the site: see the runbook.)

### If the new function does not seem to take effect

Supabase reloads its API cache by itself after SQL like this. If the site's search window still says history search "is not switched on" a few minutes after running `0124`, run `notify pgrst, 'reload schema';` once. During my local run this was the only thing needed.

## What Release B stores, and where

| Thing | Where | New SQL? |
| --- | --- | --- |
| Unsent text per conversation | Existing `workspace_drafts` table, one row per conversation (`kind = 'message'`), through the existing `save_workspace_draft` function | No (already used before Release B) |
| An unsent file or voice note per conversation (its upload record: where it is stored, its name, size and length) | The same table, one row per conversation (`kind = 'message-media'`). The file itself goes to the existing private message-files storage the moment it is chosen or recorded. | **No.** `save_workspace_draft` accepts any kind that matches its naming rule, and the new kind does. |
| **Changes that could not be saved** (Cover, Referral, Consult, availability, message text and file drafts) | **The browser's own storage on that device**, under `pa-unsaved:` and the member's account id, **only while a save is failing**. It is removed the moment a save succeeds, ignored after 14 days, and never written while saving works. | No |
| Cover and referral drafts, Consult drafts | Unchanged from earlier releases | No |

Things to know about these:

- **A chosen file or recorded voice note is uploaded straight away**, not when you press Send, so it can come back after a reload. If you remove it, discard it, cancel the upload, or the upload fails, the stored file and its draft row are removed again (tested: MB-04, MB-05, MB-06). A draft you abandon without removing it stays until you send or remove it. This is the same storage and the same 20 MB limit the site already used; Release B did not change a storage rule or policy.
- **The copy on the device holds draft text only while a save is failing.** What it holds is what the member typed into a draft: anonymous client needs and the like, already subject to the existing "no client details" checks. It is kept per account on that browser, so two people sharing a computer do not see each other's. If someone does not want text left on a shared computer, signing out of the browser profile or clearing site data removes it. It cannot be read by other sites.
- **When the workspace opens again** the copy is put back and saved, unless the version saved on the server has changed since the failed attempt (someone saved from another device): then the server's version wins, the device's copy is discarded, and a message says so. The comparison ignores the order of fields, so an unchanged draft is never mistaken for a changed one. Tested: PB-01 to PB-04.
- **Stray draft rows.** Before Release B the browser could write an extra draft row of kind `message` with the key `message`, which was never read back. The new code no longer writes it and removes any that it finds when a member opens the workspace. Nothing for you to clean up.

## Files up to 20 MB (a configuration change, not SQL)

`next.config.mjs` now sets `experimental.middlewareClientMaxBodySize` to 25 MB. Without it the framework stopped reading an upload after 10 MB, so files between 10 MB and 20 MB failed even though the site's own limit is 20 MB. With it, a 19 MB file uploads and a 21 MB file is refused with a plain message (tested locally: MB-07). **I could not test this on Cloudflare.** Please try one 15 MB file on the sandbox (see the runbook). If it fails there, tell me before going live: the cure is a small change to how uploads reach storage, and it would arrive as code only, not SQL.

## Compatibility

- **Site before SQL (or SQL never run).** The search window finds conversation names and latest messages as in Release A and, under the results, says that searching every message is not switched on yet. Nothing errors. This is deliberate. I saw it work locally while the database API did not yet know the function; I did not separately test it against a database that never had the file. Part 2 has no site-side effect: until it is run, the first message of a new referral or cover conversation is simply not counted as unread, as before.
- **SQL before site.** The old site never calls the search function. Part 2 takes effect at once and is visible to the old site too (the old site counts unread the same way).
- **Old routes and links.** No route was removed or renamed. Notifications and the unread number link to `/dashboard/messages?thread=KEY` as before; a message search result opens the same address with the message to show.
- **Existing drafts, plans, referrals, questions and messages.** Not migrated, not reset. A Consult draft written by Release A.1 still opens. A message draft written before Release B is still restored.
- **Old browser tabs.** A tab open from before the deploy keeps running the old screen until it is refreshed. It never calls the new function, ignores the new draft kind, and does not keep a copy on the device.

## Rollback

| What went wrong | What to do | Effect |
| --- | --- | --- |
| The new site looks or behaves wrongly | Cloudflare, Workers and Pages, `psyalliance` (and `psyalliance-demo`), Deployments, pick the previous version, Roll back. About a minute. | Everything visual and behavioural returns to the previous version. |
| You want part 1 gone too | `drop function if exists public.search_message_history(text, bigint, integer);` | The previous site never uses it, so you can leave it in place: it is harmless. |
| You want part 2 gone too | Run the `private.context_conversation` function from `supabase/migrations/0117_v13_workspace.sql` again (the block from `create or replace function private.context_conversation(` to its closing `$function$;`). | New conversations go back to sharing one instant between the first message and the other person's read marker. The change is harmless to leave in place after a code rollback. |
| Unsent file, voice and failed-save drafts | Nothing to undo. | The previous site ignores rows of kind `message-media` and the device copy; they stay stored, and come back if Release B is deployed again. An uploaded file with no draft record pointing at it is the same as any file chosen and never sent. |

There is no data to restore because Release B changes no existing data.

## What this release deliberately does not change

No change to matching, eligibility, outreach, scheduling, acceptance, placement or any server rule that decides who is asked. No email is sent, changed or newly triggered (see `release_notes.md`, "Emails"). No change to signup, terms, the Library review gate, storage policies, or any permission or policy. Message sending, delivery and retry rules are unchanged: Release B adds draft and file handling around them, and tests that a message is delivered once.
