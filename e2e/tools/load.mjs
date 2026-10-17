// Load test against the local staging stack (never a hosted site): signed-in
// fictional members open member pages at the same time, and some send
// messages, for a fixed time at each concurrency level. Reports latency
// percentiles, errors and throughput per level to reports/<run>/load.json.
//
// What this measures: the app's own work per page (server rendering and
// database round trips) on one Node process, not Cloudflare's capacity.
//   E2E_BASE_URL=http://localhost:3601 E2E_RUN=load node tools/load.mjs 5,20,40 45
import fs from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3601";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("load tests only run against the local stack");
const RUN = process.env.E2E_RUN || `load-${Date.now()}`;
const levels = (process.argv[2] || "5,20,40").split(",").map(Number);
const seconds = Number(process.argv[3] || 45);
const STAGE = process.env.STAGE || "/opt/stage";
const fixtures = JSON.parse(fs.readFileSync(`${STAGE}/secrets/fixtures.json`, "utf8")).accounts;
const keys = Object.fromEntries(
  fs.readFileSync(`${STAGE}/secrets/keys.env`, "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))
);
const SUPABASE = "http://127.0.0.1:54321";
const MEMBERS = ["avery", "bram", "cass", "fenn", "dara"];
const PAGES = ["/dashboard", "/dashboard/cover", "/dashboard/refer", "/dashboard/consult", "/dashboard/clinicians", "/dashboard/messages", "/dashboard/network", "/dashboard/profile", "/dashboard/settings", "/dashboard/documents"];

async function cookieFor(key) {
  const a = fixtures[key];
  let jar = [];
  const c = createServerClient(SUPABASE, keys.STAGE_ANON_KEY, {
    cookies: { getAll: () => jar.map(({ name, value }) => ({ name, value })), setAll: (cs) => { for (const x of cs) { jar = jar.filter((j) => j.name !== x.name); if (x.value) jar.push(x); } } },
  });
  const { error } = await c.auth.signInWithPassword({ email: a.email, password: a.password });
  if (error) throw new Error(`sign-in ${key}: ${error.message}`);
  return jar.map((j) => `${j.name}=${j.value}`).join("; ");
}

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null);

async function level(n, cookies) {
  const lat = [];
  const byPage = {};
  let errors = 0, slow = 0;
  const errorsSample = [];
  const end = Date.now() + seconds * 1000;
  async function user(i) {
    const key = MEMBERS[i % MEMBERS.length];
    while (Date.now() < end) {
      const page = PAGES[Math.floor(Math.random() * PAGES.length)];
      const t0 = performance.now();
      try {
        const r = await fetch(BASE + page, { headers: { cookie: cookies[key] }, redirect: "manual" });
        await r.arrayBuffer();
        const ms = performance.now() - t0;
        lat.push(ms);
        (byPage[page] ||= []).push(ms);
        if (ms > 3000) slow++;
        if (r.status >= 400 || (r.status >= 300 && !/\/dashboard/.test(r.headers.get("location") || ""))) {
          errors++;
          if (errorsSample.length < 5) errorsSample.push(`${r.status} ${page} ${r.headers.get("location") || ""}`);
        }
      } catch (e) {
        errors++;
        if (errorsSample.length < 5) errorsSample.push(`${page} ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 600)); // a person pauses between clicks
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, (_, i) => user(i)));
  const wall = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const pages = Object.fromEntries(Object.entries(byPage).map(([p, a]) => { a.sort((x, y) => x - y); return [p, { n: a.length, p50: Math.round(pct(a, 50)), p95: Math.round(pct(a, 95)) }]; }));
  return { users: n, seconds: Math.round(wall), requests: lat.length, perSecond: +(lat.length / wall).toFixed(1), errors, errorRate: +(errors / Math.max(1, lat.length + errors)).toFixed(4), over3s: slow, p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), p99: Math.round(pct(lat, 99)), max: Math.round(lat.at(-1) || 0), pages, errorsSample };
}

const cookies = {};
for (const m of MEMBERS) cookies[m] = await cookieFor(m);
const out = { run: RUN, base: BASE, at: new Date().toISOString(), note: "One Node process (next start) on the test machine with the local database; relative numbers, not production capacity.", levels: [] };
for (const n of levels) {
  const r = await level(n, cookies);
  out.levels.push(r);
  console.log(`${n} users: ${r.requests} requests, ${r.perSecond}/s, p50 ${r.p50} ms, p95 ${r.p95} ms, p99 ${r.p99} ms, errors ${r.errors}`);
}
const dir = path.join(process.cwd(), "reports", RUN);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "load.json"), JSON.stringify(out, null, 2));
