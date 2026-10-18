import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs } from "../../lib/auth";

// Lists every colour-contrast failure on the pages the 18 Oct colours touch.
const PAGES: [string, boolean][] = [["/tour", false], ["/dashboard", true], ["/dashboard/profile", true], ["/dashboard/availability", true], ["/dashboard/credentials", true], ["/dashboard/continuity", true], ["/dashboard/cover", true], ["/dashboard/refer", true], ["/dashboard/network", true], ["/dashboard/messages", true], ["/library", false], ["/privacy", false]];
test("contrast details", async ({ page, context, baseURL }) => {
  test.setTimeout(5 * 60_000);
  await signInAs(context, "avery", baseURL!);
  for (const [p] of PAGES) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
    const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    for (const v of r.violations)
      for (const n of v.nodes) console.log(`${p} | ${n.target.join(" ")} | ${(n.any[0]?.message || "").replace(/\s+/g, " ").slice(0, 160)}`);
  }
});
