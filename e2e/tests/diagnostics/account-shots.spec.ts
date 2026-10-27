import { test } from "@playwright/test";
import fs from "fs";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Screenshots of the account pages for review (desktop and phone).
// E2E_SHOT_PAGES=/dashboard/profile,/dashboard/settings  E2E_SHOT_WHO=avery  E2E_SHOT_OUT=/tmp/work/shots
const OUT = process.env.E2E_SHOT_OUT || "/tmp/work/shots";
const WHO = process.env.E2E_SHOT_WHO || "avery";
const PAGES = (process.env.E2E_SHOT_PAGES || "/dashboard/profile").split(",");
const SIZES = (process.env.E2E_SHOT_SIZES || "desktop").split(",");

test("account page shots", async ({ browser, baseURL }) => {
  assertLocal(baseURL!);
  test.setTimeout(10 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: size === "phone" ? { width: 412, height: 915 } : { width: 1366, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
    await signInAs(context, WHO, baseURL!);
    const page = await context.newPage();
    for (const p of PAGES) {
      await page.goto(p, { waitUntil: "load", timeout: 120_000 }).catch(() => null);
      await page.waitForLoadState("networkidle").catch(() => null);
      await page.waitForTimeout(500);
      const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
      await page.screenshot({ path: `${OUT}/${WHO}-${size}-${name}.png`, fullPage: true });
      console.log(`${size} ${p} -> ${page.url()}`);
    }
    await context.close();
  }
});
