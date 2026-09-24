# V1 preview: independent database and Worker

The release candidate stays on the draft PR until the preview is exercised. The production Worker and Supabase project (`vvmulsyvyjsxhcpqfpyo`) must not receive these migrations or assets during the preview.

## Required setup

1. Create a **Supabase development branch** from the PsyAlliance project. Branch billing needs the project organization ID and a confirmed cost before creation. The branch starts without production member data.
2. Apply migrations `20260923154033_trust_and_library_gates.sql`, `20260924110000_referral_waitlist_state.sql`, then `20260924110100_referral_lifecycle.sql` to that branch, in order. Check Supabase migration history before applying; never reapply an installed migration. Inspect all three with the project DBA before execution.
3. Configure the branch Auth site URL and redirect allowlist to the preview Worker URL. Set up two controlled verified clinician accounts and one pending account **on the branch** using evidence-backed review steps; do not mark synthetic identities as verified in production. Use de-identified, synthetic case data. One separate administrator account reviews the pending state.
4. Supply the branch public URL and publishable key, the separate preview Worker URL, and Cloudflare deployment credentials as environment variables. `npm run preview:deploy` refuses the production Supabase project/key and production Worker URL, builds with the branch variables, and deploys a Worker called `psyalliance-v1-preview`.

   ```sh
   export PREVIEW_SUPABASE_URL=https://YOUR-BRANCH-REF.supabase.co
   export PREVIEW_SUPABASE_ANON_KEY=YOUR-BRANCH-PUBLISHABLE-KEY
   export PREVIEW_SITE_URL=https://psyalliance-v1-preview.YOUR-SUBDOMAIN.workers.dev
   export CLOUDFLARE_ACCOUNT_ID=YOUR-ACCOUNT-ID
   export CLOUDFLARE_API_TOKEN=YOUR-DEPLOY-TOKEN
   npm run preview:deploy
   ```

The script creates a short-lived Wrangler config with branch public values and deletes it when the command finishes. Keep the Cloudflare token out of files and shell history where possible. The separate Worker may incur standard Cloudflare usage charges; confirm the actual account settings first. No production data is copied.

## Demonstration script and acceptance gates

| Role | Action | Expected evidence |
| --- | --- | --- |
| Visitor | Open landing page at desktop and 390px; visit sign-up | Coherent hierarchy, readable controls, accurate membership/privacy copy |
| Pending applicant | Sign in; visit Home, credentials, direct `/dashboard/requests` | Guided application; no network or request data via UI or direct REST |
| Clinician A | Create a selected referral, review suggestions, choose B | Before choosing B, only A sees the draft; B gets an in-app alert after selection |
| Clinician B | Respond interested; separately try waitlist/question | A sees exact response and can reply in Messages; no patient details |
| Clinician A | Connect with B, mark external handoff, close with matched outcome | Only an interested B can be connected; chosen B and outcome persist; unrelated C cannot see the handoff |
| Clinician A/B | Create cover case in service state, invite B, discuss/accept or decline | Case and request transition atomically; other pending invitations expire on acceptance |
| Clinician A/B | Create a group, write charter, invite B, post consultation | B acknowledges charter; nonmember C cannot read group post or replies |
| All | Visit relevant workflows and Library | Only independently published PA resources open; drafts show as under review; no unreviewed download |
| Member | Open an in-app notification with altered form payload | Server reads the stored target and redirects only to a dashboard path |
| Provider | Send office inquiry; try to POST initials/free text via REST | Controlled purpose and registered office contact only; clinical handoff stays outside the product |

Repeat the database authorization checks as `anon`, pending, A, B, and unrelated C; inspect Worker logs, 1102/CPU/memory signals, and browser network errors. Do not declare a full V1 release ready on the basis of a build. Qualified independent reviewers must sign off on all PA resource versions before publication; legacy patient data needs an inventory, export, and retention decision.

## Current limitations

- The new email delivery rows remain **pending** until a real provider/worker is configured; in-app alerts work in source, but branch verification is outstanding. Existing Settings preferences are preparatory.
- The seven PA documents are linked from their workflows only when a reviewed version is actually published. The attached starter PDFs are not automatically approved.
- Group charter acknowledgement is checked at join time; re-acknowledgement after a later charter revision, group archive, recurring reminders, and digest delivery remain work before a broad cohort.
- This runbook and preview script do not create a Supabase branch or Worker by themselves. Credentials, branch cost confirmation, migrations, and two-account browser testing are still required.
