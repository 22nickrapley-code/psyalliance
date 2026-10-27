import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "fs";
import { signInAs, account } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Full axe report (WCAG 2.1 A and AA) on every account page, desktop and phone.
// Writes E2E_A11Y_OUT (default /tmp/work/a11y-account.tsv): who, size, page, rule, impact, selector, detail.
const OUT = process.env.E2E_A11Y_OUT || "/tmp/work/a11y-account.tsv";
const ADMIN = ["", "/activation", "/channel-requests", "/insurance-requests", "/invitations", "/library-leads", "/library", "/members", "/moderation", "/network-health", "/referring-providers", "/sandbox", "/states", "/verifications"].map((s) => `/dashboard/admin${s}`);

test("account pages axe", async ({ browser, baseURL }) => {
  assertLocal(baseURL!);
  test.setTimeout(30 * 60_000);
  const bram = account("bram").id;
  const plans: [string, string[]][] = [
    ["avery", ["/dashboard/profile", "/dashboard/credentials", "/dashboard/continuity", "/dashboard/continuity/duties", "/dashboard/documents", "/dashboard/notifications", "/dashboard/settings", "/dashboard/demos", "/dashboard/consult/groups", `/dashboard/people/${bram}`]],
    ["pell", ["/dashboard/overview", "/dashboard/profile", "/dashboard/documents"]],
    ["otto", ADMIN.concat(["/dashboard/settings"])],
  ];
  const rows: string[] = [];
  for (const [who, pages] of plans)
    for (const phone of [false, true]) {
      const context = await browser.newContext({ viewport: phone ? { width: 412, height: 915 } : { width: 1366, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
      await signInAs(context, who, baseURL!);
      const page = await context.newPage();
      for (const p of pages) {
        await page.goto(p, { timeout: 120_000 }).catch(() => null);
        await page.waitForLoadState("networkidle").catch(() => null);
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
        await page.waitForTimeout(400);
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
        for (const v of r.violations)
          for (const n of v.nodes) {
            const d: any = n.any[0]?.data || {};
            const detail = v.id === "color-contrast" ? `${d.fgColor} on ${d.bgColor} ${d.contrastRatio} ${d.fontSize}` : (n.any[0]?.message || n.all[0]?.message || "").replace(/\s+/g, " ").slice(0, 140);
            rows.push([who + (phone ? ":phone" : ""), p, v.id, v.impact, n.target.join(" ").slice(0, 150), detail].join("\t"));
          }
        console.log(`${who}${phone ? ":phone" : ""} ${p} -> ${page.url().replace(baseURL!, "")}`);
      }
      await context.close();
    }
  fs.writeFileSync(OUT, ["who\tpage\trule\timpact\tselector\tdetail", ...rows].join("\n"));
  console.log(`${rows.length} findings -> ${OUT}`);
});
