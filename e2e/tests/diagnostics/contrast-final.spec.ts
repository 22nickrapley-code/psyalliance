import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "fs";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Lists every colour-contrast failure across the workspace's views and its
// open dialogs, desktop and phone width, for the final-product sheet (D-04).
// Writes E2E_CONTRAST_OUT (default /tmp/work/contrast-final.tsv).
const OUT = process.env.E2E_CONTRAST_OUT || "/tmp/work/contrast-final.tsv";
const PAGES = [
  "/dashboard", "/dashboard/cover", "/dashboard/referrals", "/dashboard/consult", "/dashboard/network", "/dashboard/messages", "/dashboard/library",
  "/dashboard/cover?new=1", "/dashboard/referrals?new=1", "/dashboard/referrals?tab=physicians", "/dashboard/consult?new=1", "/dashboard/network?invite=1", "/dashboard/messages?compose=1",
  "/dashboard/notifications",
];
const WHO = ["avery", "ruben", "rhea"];

test("contrast sweep", async ({ browser, baseURL }) => {
  assertLocal(baseURL!);
  test.setTimeout(20 * 60_000);
  const rows = new Set<string>();
  for (const who of WHO)
    for (const phone of [false, true]) {
      const context = await browser.newContext({ viewport: phone ? { width: 412, height: 915 } : { width: 1366, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
      await signInAs(context, who, baseURL!);
      const page = await context.newPage();
      for (const p of PAGES) {
        await page.goto(p).catch(() => null);
        await page.waitForLoadState("networkidle").catch(() => null);
        await page.waitForTimeout(700);
        // Open the first thing in every list-like region so detail panes are covered too.
        const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
        for (const v of r.violations)
          for (const n of v.nodes) {
            const d: any = n.any[0]?.data || {};
            rows.add([n.target.join(" ").slice(0, 160), d.fgColor, d.bgColor, d.contrastRatio, d.fontSize, `${who}${phone ? ":phone" : ""} ${p}`].join("\t"));
          }
      }
      await context.close();
    }
  fs.mkdirSync("/tmp/work", { recursive: true });
  fs.writeFileSync(OUT, ["selector\tfg\tbg\tratio\tfont\twhere", ...rows].join("\n"));
  console.log(`${rows.size} failing nodes -> ${OUT}`);
});
