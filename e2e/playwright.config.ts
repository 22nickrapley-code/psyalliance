import { defineConfig, devices } from "@playwright/test";

// PsyAlliance acceptance suite.
//
// Projects:
//   public   read-only public pages; any address (E2E_BASE_URL), safe on live
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
    { name: "public-phone", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "staging", testMatch: /staging\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "staging-phone", testMatch: /staging\/phone\/.*\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "live", testMatch: /live\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "diagnostics", testMatch: /diagnostics\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
