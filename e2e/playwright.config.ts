import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Tests of screens the final product replaced are retired, not deleted: docs/psyalliance-v13-parity/legacy_test_triage.csv
// lists each one with the test that covers it now. Rows whose status starts with "Replaced" are left out of a normal run
// (a test ported in place keeps running; its row says "In place");
// E2E_INCLUDE_RETIRED=1 runs them too (they are expected to fail against the new screens).
function retiredTests(): RegExp | undefined {
  if (process.env.E2E_INCLUDE_RETIRED) return undefined;
  try {
    const text = fs.readFileSync(path.join(process.cwd(), "../docs/psyalliance-v13-parity/legacy_test_triage.csv"), "utf8");
    const rows: string[][] = [];
    let row: string[] = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    const head = rows.shift() || [];
    const iTest = head.indexOf("legacy_test"), iStatus = head.indexOf("status");
    // A row names its test by its id (the first word, such as J-COVER-01); the wording after it may differ from the real title.
    // The id must start a title (follow a space), so a test that only mentions another test's id in brackets is not retired by mistake.
    const names = rows
      .filter((r) => /^Replaced/.test(r[iStatus]?.trim() || "") && r[iTest])
      .map((r) => r[iTest].trim())
      .map((t) => (/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+/.test(t) ? `(?<=\\s)${t.split(/\s/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])` : t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return names.length ? new RegExp(names.join("|")) : undefined;
  } catch {
    return undefined;
  }
}

// PsyAlliance acceptance suite.
//
// Projects:
//   public   read-only public pages; any address (E2E_BASE_URL), safe on live
//            (public-live and public-sandbox point at the two live sites)
//   staging  full journeys on the disposable local stack (e2e/staging)
//   live     signed-in, low-impact checks on psyalliance.org with the two
//            named test profiles; uses browser sign-ins Nick saved himself
//            (npm run login:live), never a password in this suite
//
// Evidence lands in e2e/reports/<run>/: an HTML report, JSON and JUnit
// results, screenshots, traces and sanitised console/network logs.
const RUN = process.env.E2E_RUN || `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
const OUT = `reports/${RUN}`;
const BASE = process.env.E2E_BASE_URL || "http://localhost:3600";

export default defineConfig({
  testDir: "./tests",
  outputDir: `${OUT}/artifacts`,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  grepInvert: retiredTests(),
  workers: Number(process.env.E2E_WORKERS || 1),
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${OUT}/html`, open: "never" }],
    ["json", { outputFile: `${OUT}/results.json` }],
    ["junit", { outputFile: `${OUT}/junit.xml` }],
  ],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "on",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    locale: "en-US",
    timezoneId: "America/New_York",
  },
  metadata: { run: RUN, base: BASE, build: process.env.E2E_BUILD || "unknown" },
  projects: [
    { name: "public", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // The same read-only public checks against the two live sites.
    { name: "public-live", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: "https://psyalliance.org" } },
    { name: "public-sandbox", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: "https://sandbox.psyalliance.org" } },
    { name: "public-phone", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "staging", testMatch: /staging\/.*\.spec\.ts/, testIgnore: /staging\/phone\//, use: { ...devices["Desktop Chrome"] } },
    { name: "staging-phone", testMatch: /staging\/phone\/.*\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    // Live, signed in as the two authorised fictional test profiles. No
    // traces or video (they would hold session cookies); screenshots only
    // when a check fails.
    { name: "live", testMatch: /live\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: process.env.E2E_LIVE_URL || "https://psyalliance.org", trace: "off", video: "off", screenshot: "only-on-failure" } },
    { name: "diagnostics", testMatch: /diagnostics\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
