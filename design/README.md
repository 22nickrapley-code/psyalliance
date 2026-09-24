# PsyAlliance premium full concept

Open [`psyalliance-premium-full-concept.html`](./psyalliance-premium-full-concept.html) in a desktop or mobile browser. The file is self-contained, including its fonts. It is a **design and interaction mockup** with synthetic clinicians, sample dates and local state. It does not read the live product, store information, send email, publish a consultation, contact a clinician or validate professional credentials.

## What to review

| Area | What the concept illustrates |
| --- | --- |
| Public | Concise positioning, a three-step example of coverage and restrained trust language. |
| Home | One action queue, separate availability signals, clear task entry points and relevant circle activity. |
| Requests / coverage | Plan → Needs → Candidates → Invite → Track, a persistent summary, reasoned candidates and an unresolved need after a partial response. |
| Referrals | Define a non-identifying need → shortlist → recipient review → interest and outcome tracking. |
| Network | Task-oriented directory search, service/state/availability filters, relationship collections, profile facts with freshness, invitations, private Save/Exclude and Block controls. |
| Consult | Discussion feed, three audience scopes, selected-recipient control, structured question, de-identification review, replies, private follow-up, resolution and a group space with a PA-04 charter. |
| Messages | Threads with coverage or group context. |
| Practice Library | Curated PA resource cards, search/categories, editorial metadata and links into the related workflow. |
| Availability / Credentials / Profile | Separate capacity signals, renewal context, evidence provenance and a concise professional profile. |
| Mobile | Compact top bar and five-item bottom navigation; other pages are available from the menu. |

Use the top banner to move between the public page and member experience. Within the member workspace, use the side navigation on desktop or the bottom navigation and menu on mobile. The main buttons, filters, modals and step controls demonstrate local interactions. Reloading the file resets sample changes.

## Design decisions to carry into implementation

- Follow the palette, type, spacing and component proportions in the file. Prefer whitespace and factual hierarchy over additional tiles, gradients or badge colors.
- Keep **Home, Requests, Network, Consult and Messages** as the primary navigation. Put the Library, Availability, Credentials and Profile in secondary navigation. Do not put legacy product routes in the member rail.
- Put a searchable directory at the top of Network. A connection invitation is supporting work, and a clinician profile should distinguish reviewed professional facts from member-reported availability and relationship history.
- Keep **Trusted**, **Saved**, **Worked with before**, **Suggested**, **Exclude** and **Block** distinct. Exclude is a private matching preference; Block is an access restriction. Implement their policy and enforcement on the server.
- In Consult, require an intentional choice among **Trusted colleagues**, **Selected clinicians** and **Verified network**. Show selected recipients on the final review screen. Actual recipient access, moderation, de-identification safeguards, notifications and audit events need server-side implementation.
- Preserve partial and unresolved states in coverage and referrals. A sent invitation or an interested clinician is not a completed clinical arrangement.
- Treat the seven contextual PA links as workflow entry points; surface the source, reviewer, version and caution details of real resources once editorially approved. The content and metadata in this concept are illustrative.
- Build real loading, empty, error, permission, stale and success states, with keyboard and screen-reader review. This HTML is a design target, not a production-ready front end.

This file is deliberately separate from the running Next.js app and makes no production or clinician-facing changes.
