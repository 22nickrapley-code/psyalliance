# PsyAlliance agent query API (M4)

A public Cloudflare Worker in front of the `public_directory` Postgres view -
the down payment on "agent-native from day one." It exposes:

- `GET /api/search?specialism=Anxiety&state=TX&accepting_referrals=true` -
  friendly filters over the verified directory, grouped into one JSON object
  per psychologist (the underlying view is one row per specialism/modality,
  joined).
- `GET /api/psychologist/:id` - full public detail for one person.
- `GET /.well-known/mcp.json` - a WebMCP-style tool descriptor, so an AI
  agent can discover `search_psychologists` / `get_psychologist` without
  being told about this API out of band.

## What's NOT built yet

- **Deployment.** This code has not been deployed - no Cloudflare deploy
  tool is available in this session (only read-only Worker inspection, plus
  D1/KV/R2/Hyperdrive management). Two ways to ship it:

  **With the CLI** (needs Node + wrangler installed locally):
  ```
  cd workers/agent-api
  npm install
  wrangler login          # if not already
  wrangler secret put SUPABASE_URL         # https://vvmulsyvyjsxhcpqfpyo.supabase.co
  wrangler secret put SUPABASE_ANON_KEY    # the publishable/anon key, safe to use here -
                                            # it only reaches what public_directory grants
  wrangler deploy
  ```

  **Without installing anything** (browser only - use this if a local
  install would touch antivirus/endpoint-protection tooling you'd rather
  leave alone):
  1. dash.cloudflare.com -> **Workers & Pages** -> **Create** -> **Create
     Worker**. Name it (e.g. `psyalliance-agent-api`) -> **Deploy**.
  2. **Edit code** (a.k.a. **Quick edit**) opens the in-browser editor.
     Select all, delete, and paste in the contents of
     `deploy/dashboard-quick-edit.js` (a hand-kept plain-JS copy of
     `src/index.ts` - same logic, just without TS type annotations so it
     runs directly in the dashboard's editor). **Save and deploy**.
  3. Worker's page -> **Settings -> Variables and Secrets -> Add**:
     - `SUPABASE_URL` = `https://vvmulsyvyjsxhcpqfpyo.supabase.co`
     - `SUPABASE_ANON_KEY` = the anon key from `.env.local` / `get_publishable_keys`
       (safe to paste anywhere - it only reaches what `public_directory` grants)
  4. Test the printed `*.workers.dev` URL: `/api/search?state=TX` and
     `/.well-known/mcp.json`.

  If you edit `src/index.ts`, keep `deploy/dashboard-quick-edit.js` in sync
  by hand (or run it through `npx esbuild --minify=false` if you do have
  Node locally) - the dashboard path only ever sees the plain-JS file, never
  the TypeScript source.
- **Paid tier.** `X-API-Key` is checked and a `tier: "free" | "paid"` field
  is returned, but nothing is actually gated behind it yet - there's no
  gated data (scoring, endorsements, live availability) built to sell
  access to. The hook exists so that when there is, it plugs in without an
  API reshape. Issue keys by setting the `PAID_API_KEYS` secret
  (comma-separated) once that's real.
- **Rate limiting / abuse protection.** None yet - fine for a directory with
  a handful of verified profiles, worth adding (Cloudflare rate limiting
  rules, or a KV-backed counter) before this gets real traffic.

## Local testing

```
npm run dev
curl 'http://localhost:8787/api/search?state=TX'
curl 'http://localhost:8787/.well-known/mcp.json'
```
