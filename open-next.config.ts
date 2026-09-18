import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default config: Next.js's Node.js runtime (Server Actions, Route
// Handlers, RSC) running as a Cloudflare Worker via OpenNext, static
// assets served from Cloudflare's asset binding. No KV/R2/D1 bindings
// needed yet - everything durable lives in Supabase over HTTPS.
export default defineCloudflareConfig();
