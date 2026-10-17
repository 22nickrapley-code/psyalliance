// Saves a browser sign-in for the live checks, without the suite ever
// seeing a password: a visible browser opens the real sign-in page, you sign
// in yourself, and once you reach your dashboard the session is saved to
// e2e/.auth/<name>.json (never committed: .auth/ is in .gitignore). Treat
// that file like a password; delete it when testing is done.
//
//   npm run login:live -- rachel        (Rachel E. Jadkowski, PsyD)
//   npm run login:live -- rena          (Rena Pazienza, PhD)
//   npm run login:live -- rena https://sandbox.psyalliance.org
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ALLOWED = { rachel: "Rachel E. Jadkowski, PsyD", rena: "Rena Pazienza, PhD" };
const key = (process.argv[2] || "").toLowerCase();
const base = process.argv[3] || "https://psyalliance.org";
if (!ALLOWED[key]) {
  console.error(`Usage: npm run login:live -- <${Object.keys(ALLOWED).join("|")}> [site]`);
  console.error("Only the two profiles authorised for fictional testing can be saved.");
  process.exit(2);
}
if (!/^https:\/\/(sandbox\.)?psyalliance\.org$/.test(base)) {
  console.error("Only https://psyalliance.org or https://sandbox.psyalliance.org.");
  process.exit(2);
}
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/auth/sign-in`);
console.log(`\nSign in as ${ALLOWED[key]} in the browser window that just opened.`);
console.log("This waits (up to 10 minutes) until you reach the dashboard, then saves the sign-in and closes.\n");
await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 10 * 60 * 1000 });
const name = await page.locator("aside").innerText().catch(() => "");
if (!name.includes(ALLOWED[key].split(",")[0].split(" ").at(-1))) {
  console.error(`Signed in, but not as ${ALLOWED[key]}. Nothing saved.`);
  await browser.close();
  process.exit(1);
}
const dir = path.join(process.cwd(), ".auth");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${key}${base.includes("sandbox") ? "-sandbox" : ""}.json`);
await context.storageState({ path: file });
try {
  fs.chmodSync(file, 0o600);
} catch {}
await browser.close();
console.log(`Saved: ${file}\nKeep it private. Delete it when you've finished testing.`);
