import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
test("lanes at rest", async ({ page, context, baseURL }) => {
  test.setTimeout(120000);
  await signInAs(context, "bram", baseURL!);
  for (const p of ["/dashboard/messages", "/dashboard/cover", "/dashboard"]) {
    await page.goto(p);
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const own = Object.keys(document);
      const key = own.find((k) => k.startsWith("__reactContainer$"));
      const root = key ? (document as any)[key]?.stateNode : null;
      return { n: own.length, sample: own.slice(0, 5), next: !!(window as any).next, pending: root?.pendingLanes, suspended: root?.suspendedLanes };
    });
    console.log("LANES", p, JSON.stringify(r));
  }
});
