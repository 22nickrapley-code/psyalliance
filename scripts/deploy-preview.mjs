import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const prodRef = "vvmulsyvyjsxhcpqfpyo";
const url = process.env.PREVIEW_SUPABASE_URL;
const key = process.env.PREVIEW_SUPABASE_ANON_KEY;
const siteUrl = process.env.PREVIEW_SITE_URL;
if (!url || !key || !siteUrl || !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("Set PREVIEW_SUPABASE_URL, PREVIEW_SUPABASE_ANON_KEY, PREVIEW_SITE_URL, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_ID before deploying.");
}
const parsed = new URL(url);
if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") || parsed.hostname.includes(prodRef)) {
  throw new Error("The preview must use a distinct HTTPS Supabase branch, never the production project.");
}
const site = new URL(siteUrl);
if (site.protocol !== "https:" || site.hostname === "psyalliance.22nickrapley.workers.dev") {
  throw new Error("Use the separate HTTPS preview Worker URL, not the production site.");
}
if (key === "sb_publishable_DHIdNnOs7O5y6ucrl2T4Eg_Q3QslBZl") {
  throw new Error("Preview must use the branch publishable key.");
}

const configPath = resolve("wrangler.preview.generated.json");
const config = {
  name: "psyalliance-v1-preview",
  main: ".open-next/worker.js",
  compatibility_date: "2024-09-23",
  compatibility_flags: ["nodejs_compat"],
  assets: { directory: ".open-next/assets", binding: "ASSETS" },
  vars: {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
};
const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
  NEXT_PUBLIC_SITE_URL: siteUrl,
};
try {
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  for (const command of ["build", "deploy"]) {
    const result = spawnSync(resolve("node_modules/.bin/opennextjs-cloudflare"),
      [command, "--config", configPath], { env: buildEnv, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Preview ${command} failed (${result.status ?? result.error?.message}).`);
  }
} finally {
  unlinkSync(configPath);
}
