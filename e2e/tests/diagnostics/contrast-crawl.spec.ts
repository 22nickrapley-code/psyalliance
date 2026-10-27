import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "fs";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// A wider contrast sweep than contrast-final.spec.ts: on each workspace page it
// opens, one at a time, a sample of everything that has a data-action (dialogs,
// detail panes, menus, pickers), skipping anything that saves, sends or deletes,
// and lists every colour-contrast failure it meets. Writes E2E_CONTRAST_OUT.
const OUT = process.env.E2E_CONTRAST_OUT || "/tmp/work/contrast-crawl.tsv";
const PAGES = ["/dashboard", "/dashboard/cover", "/dashboard/referrals", "/dashboard/consult", "/dashboard/network", "/dashboard/messages", "/dashboard/library", "/dashboard?availability=1", "/dashboard?search=1", "/dashboard?settings=1"];
const SKIP = /^(nav|toggle-menu|sign|logout|close|send|submit|confirm|save|delete|remove|withdraw|cancel|place|decline|accept|answer|resolve|block|report|reset|post|reply|react|message-react|follow|trust|useful|copy|download|play|stop|record|attach|file|discard|mark|clear|undo|retry|invite-send|draft-delete|unfollow|untrust)/i;
const WHO = (process.env.E2E_CRAWL_WHO || "avery,ruben").split(",");
const PER_PREFIX = Number(process.env.E2E_CRAWL_PER || 2);

test("contrast crawl", async ({ browser, baseURL }) => {
  assertLocal(baseURL!);
  test.setTimeout(120 * 60_000);
  const rows = new Set<string>();
  let opened = 0;
  for (const who of WHO)
    for (const phone of [false, true]) {
      const context = await browser.newContext({ viewport: phone ? { width: 412, height: 915 } : { width: 1366, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
      await signInAs(context, who, baseURL!);
      const page = await context.newPage();
      for (const p of PAGES) {
        await page.goto(p).catch(() => null);
        await page.waitForLoadState("networkidle").catch(() => null);
        await page.waitForTimeout(700);
        const actions: string[] = await page.$$eval("[data-action]", (els) => els.map((e) => e.getAttribute("data-action") || ""));
        const byPrefix = new Map<string, string[]>();
        for (const a of actions) {
          const prefix = a.split(":")[0];
          if (!prefix || SKIP.test(prefix)) continue;
          const list = byPrefix.get(prefix) || [];
          if (!list.includes(a) && list.length < PER_PREFIX) list.push(a);
          byPrefix.set(prefix, list);
        }
        const targets = [...byPrefix.values()].flat();
        for (const a of ["", ...targets]) {
          if (a) {
            await page.goto(p).catch(() => null);
            await page.waitForLoadState("networkidle").catch(() => null);
            await page.waitForTimeout(300);
            const el = page.locator(`[data-action="${a.replace(/"/g, '\\"')}"]`).first();
            const clicked = await el.click({ timeout: 2500 }).then(() => true).catch(() => false);
            if (!clicked) continue;
            await page.waitForTimeout(600);
            opened++;
          }
          const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
          for (const v of r.violations)
            for (const n of v.nodes) {
              const d: any = n.any[0]?.data || {};
              rows.add([n.target.join(" ").slice(0, 160), d.fgColor, d.bgColor, d.contrastRatio, d.fontSize, `${who}${phone ? ":phone" : ""} ${p} ${a}`].join("\t"));
            }
        }
      }
      await context.close();
      fs.mkdirSync("/tmp/work", { recursive: true });
      fs.writeFileSync(OUT, ["selector\tfg\tbg\tratio\tfont\twhere", ...rows].join("\n"));
    }
  fs.mkdirSync("/tmp/work", { recursive: true });
  fs.writeFileSync(OUT, ["selector\tfg\tbg\tratio\tfont\twhere", ...rows].join("\n"));
  console.log(`${opened} things opened, ${rows.size} failing nodes -> ${OUT}`);
});
