# Migration note: v9

`0133_v9.sql` replaces `private.sandbox_story_event` with the same steps, people and timings, and new wording for the sandbox arrivals (two consult questions, two cover requests, two referrals, one reply). The function returns at once on any project whose `app_env` is not `demo`, so it has no effect on live. Run twice locally: no errors. Rollback: re-run the function from `0132_v6.sql`.
