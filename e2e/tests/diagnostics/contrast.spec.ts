import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs } from "../../lib/auth";

test("contrast details", async ({ page, context, baseURL }) => {
  const out: string[] = [];
  for (const [p, who] of [["/", ""], ["/library", ""], ["/tour", ""], ["/dashboard/cover/new", "avery"], ["/dashboard/messages", "avery"], ["/dashboard/network", "avery"], ["/dashboard/consult/new", "avery"], ["/dashboard/continuity", "avery"]] as [string, string][]) {
    if (who) await signInAs(context, who, baseURL!);
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withRules(["color-contrast", "aria-input-field-name"]).analyze();
    for (const v of r.violations) for (const n of v.nodes.slice(0, 4)) out.push(`${p} ${v.id} ${n.target.join(" ")} :: ${(n.any[0]?.data ? JSON.stringify(n.any[0].data) : n.failureSummary || "").slice(0, 220)} :: ${n.html.slice(0, 140)}`);
  }
  console.log(out.join("\n"));
});
