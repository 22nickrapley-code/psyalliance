// Builds and deploys the DEMO site to its own Cloudflare Worker
// (psyalliance-demo), pointed at the demo Supabase project. Works on
// Windows, macOS and Linux:
//
//   npm run cf:deploy:demo            build + deploy
//   npm run cf:deploy:demo -- --build-only
//
// Reads .env.demo (not committed; copy .env.demo.example). NEXT_PUBLIC_*
// values are baked in at build time, which is why the demo is a separate
// build rather than a runtime switch.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".env.demo")) {
  console.error("Missing .env.demo. Copy .env.demo.example to .env.demo and fill in the demo project's URL and publishable key.");
  process.exit(1);
}
const env = { ...process.env };
for (const line of readFileSync(".env.demo", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
env.NEXT_PUBLIC_APP_ENV = "demo";
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SITE_URL"]) {
  if (!env[k] || env[k].includes("REPLACE")) {
    console.error(`Set ${k} in .env.demo first.`);
    process.exit(1);
  }
}
if (env.NEXT_PUBLIC_SUPABASE_URL.includes("vvmulsyvyjsxhcpqfpyo")) {
  console.error("That's the production Supabase project. The demo must use its own project.");
  process.exit(1);
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("npx", ["opennextjs-cloudflare", "build"]);
if (!process.argv.includes("--build-only")) run("npx", ["opennextjs-cloudflare", "deploy", "--env", "demo"]);
