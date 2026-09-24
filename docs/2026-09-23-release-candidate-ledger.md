# PsyAlliance release candidate: implementation and remaining gates

This branch implements a substantial part of the 23 September re-audit. It has not been merged, deployed, or applied to the production database. The earlier live URL returned Cloudflare Worker 1102 during the audit; it loaded again on 24 September, serving the old landing page. A successful build is not evidence that the deployed Worker is healthy.

| Audit area | State in this branch | Evidence / release condition |
| --- | --- | --- |
| Public design | Implemented in source | Editorial landing page with a labelled, illustrative coverage sequence, trust and founder sections, practical FAQ and CTA hierarchy; review real desktop/mobile screenshots after a safe preview deployment. |
| Member Home | Implemented in source | Reduced first-page reads to five bounded queries, attention, availability and next actions; no complete event-model reconciliation. |
| Practice Library | Implemented in source; publication blocked pending review | Curated cards, search, saved tab, contextual links, metadata and short-lived document opening. The migration withdraws the 20 previously self-approved PA resources until qualified independent reviewers approve each current version. |
| Verification and fixtures | Implemented in migration, unapplied | Migration restricts seed accounts, demotes profiles without a real matched and independently reviewed board/ASPPB record, protects future transitions and fixes distinct network reach. Review true credential source evidence before admitting clinicians. |
| Patient-data boundary | Partially implemented | Legacy nav and routes retired, assignment action blocked, new member uploads stopped, new caseload/referral-assignment direct writes revoked; older member files and caseload records remain readable for controlled export/retention. Inventory existing storage, messages, exports and logs before claiming a no-PHI platform. |
| Consult selected audience | Implemented in source and migration, untested with two accounts | Up to 25 selected verified clinicians, server-side recipient validation; author can see own selected question. Exercise recipient and non-recipient ACLs before release. |
| Referral audience | Partially implemented | Defaults to selected, exact distinct verified network count and explicit widening confirmation. Existing selected-recipient flow remains. No two-account lifecycle proof. |
| Network experience | Partially implemented | Directory entry point and responsive styles; Accepted Bench contacts are migrated to private Saved Clinicians; underlying legacy connection rows remain for audit and matching cleanup. |
| Pending member experience | Implemented in source; unproven | Home gives an applicant clear profile, credential and availability steps, with flagged/rejected wording; sidebar shows usable setup destinations and skips badge queries. Direct URL access and fresh-account/admin review still require controlled tests. |
| Worker reliability | Unverified | OpenNext Cloudflare build succeeds, but live 1102 root cause and production logs unavailable here. Need Worker request CPU/memory traces and repeated authenticated route smoke after deployment. |
| Coverage and group workflow | Source expanded, migration unapplied; unproven | Requests now reveal matching for one owned case/referral at a time. New cases require an explicit state of service, and extended/reciprocal plan types collect required context. A security-definer response function moves a request and case together, preserving discussion as an active state and expiring other offers after acceptance. Two-account and group trials remain required. |
| Mobile and accessibility | Partial | Responsive CSS and keyboard focus/reduced motion support added; real-device, screen-reader, contrast and visual screenshots still needed. |

## Safe deployment order

1. Review migration `supabase/migrations/20260923154033_trust_and_library_gates.sql` with the project DBA and run it on an isolated Supabase branch. Verify roles, storage policies, existing schema and direct REST behavior under **authenticated** and **anon** roles. A build does not execute this SQL.
2. Confirm an archive of existing documents and clinical data, inventory legacy exports and storage, and establish an owner and retention schedule. The migration preserves existing records; it removes publication from the 20 shared PA files and demotes unsubstantiated verified profiles.
3. Apply the migration before deploying the web branch, then verify that admins can view the review queue, qualified reviewers can open and review drafts, other members cannot see drafts, and no existing document is visible as published until its independent approvals and metadata are complete. Commission qualified clinical, legal, prescribing and privacy reviewers; code cannot supply their judgments.
4. Deploy the Worker. Verify public, sign-in, pending, verified, admin and reviewer routes with repeated cold/warm requests, inspect Worker limits/logs for 1102, and test page layouts at 1440, 768 and 390px.
5. Exercise independent two-account coverage, referral and Consult cases, declined/partial outcomes, selected-audience ACLs, message receipt, notification deep links and expiry/stale availability. Fix any blocker before inviting a clinician cohort.

## Known migration impact and rollback

The migration changes verification, document and referral permissions and removes member-visible publication from the current PA starter set. It is deliberately not safe to treat it as a cosmetic change. To roll back a failed deploy, restore application and schema together from reviewed backups or a reversible migration prepared against the actual database state; simply resetting `review_status='published'` would re-expose unreviewed material. Do not republish through a status flip.

## Local checks

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run cf:build` passed (OpenNext Worker bundle generated).
- `git diff --check` passed.
- SQL not applied or executed against production; no authenticated end-to-end or browser screenshot proof in this branch.

## 24 September follow-up

- The previous Requests overview matched every open coverage case and referral sequentially. This revision runs the multi-table matcher only for the owned row opened by the member and exposes a clear review action and zero-match state. The first fold now puts the task, steps and two creation actions above progressively disclosed forms.
- The public page now leads with the independent practice proposition and shows a concrete three-step, explicitly illustrative coverage decision, followed by practical membership/privacy/coverage questions. This has been built but not visually reviewed in a browser because the cloud browser cannot reach the local preview.
- Pending or flagged applicants see a setup journey instead of the verified member action grid. Their sidebar contains only Home, Profile, Credentials, Availability and Settings; this is navigation guidance, not a substitute for database permissions on direct URLs.
- Coverage previously used the **plan owner's** states as the candidate licence filter. The new `service_state` is required for new cases, and matching returns no candidates when an older case lacks that state. Production currently has **zero** coverage cases and **zero** coverage requests (read-only database counts on 24 September); data in any other environment needs an inventory before this migration is applied.
- A recipient could update their request while an application-side update of the case failed under owner-only case RLS. The new `respond_to_coverage_request` operation checks recipient, account, request and case state, then commits both changes together. Direct authenticated updates to requests are revoked. Case claims require a matching accepted or active request. Rejection rows now require ownership of the parent plan.
- The new SQL has **not** been executed against an isolated database. Re-test the old and new application during migration ordering, PostgREST RPC type resolution, RLS under two real accounts, duplicate sends and response races. Verify `discussing` → accepted/declined, decline with no remaining candidate, and simultaneous invitations before calling the workflow ready.
- The cloud browser could read the live site, but it blocked `127.0.0.1:3000`, so the revised member UI has no browser screenshot or mobile proof. Browser tests must run against a safe deployed preview after schema verification. The live Worker and this branch are different revisions.
