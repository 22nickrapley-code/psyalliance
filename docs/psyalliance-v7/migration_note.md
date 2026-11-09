# v7 migration note

**No database migration in v7.** Every change is in the site's code and styles.

- The Hub assistant reads the member's own data through the existing `workspace_slice` function (people, tiers, threads, plans, referrals, consult, resources, year). It sends the AI provider counts of messages per colleague, never message text.
- "Show as text" for voice notes uses the existing `message_file` function (the same check that lets the two people in a conversation open a file) and the existing `message-files` storage bucket, then Cloudflare Workers AI (Whisper). Nothing is stored; the text is shown to the person who asked.
- `wrangler.jsonc` gains `"ai": { "binding": "AI" }` at the top level and in `env.demo`.

Rollback: roll the Worker back to the previous deployment. If you keep v7 but want transcription off, remove the two `"ai"` lines and redeploy.
