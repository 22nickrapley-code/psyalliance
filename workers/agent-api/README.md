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

- **Deployment.** This code has not been deployed - there is no
  `workers deploy`/create tool available to me in this session (only
  read-only Worker inspection, plus D1/KV/R2/Hyperdrive management). To ship
  it:
  ```
  cd workers/agent-api
  npm install
  wrangler login          # if not already
  wrangler secret put SUPABASE_URL         # https://vvmulsyvyjsxhcpqfpyo.supabase.co
  wrangler secret put SUPABASE_ANON_KEY    # the publishable/anon key, safe to use here -
                                            # it only reaches what public_directory grants
  wrangler deploy
  ```
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
