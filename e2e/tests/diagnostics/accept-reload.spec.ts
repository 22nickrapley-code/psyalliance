import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
import { coverPlan } from "../../lib/scenarios";

// Why an Accept is sometimes followed by a full page load: record React's
// pending work every 200 ms (kept across the reload) to see whether the
// screen was really stuck when the watchdog stepped in.
for (let n = 0; n < Number(process.env.PROBES || 8); n++)
  test(`accept reload probe ${n}`, async ({ page, context, baseURL }) => {
    const plan = await coverPlan("avery", ["bram"], [`Client P${n}`]);
    await signInAs(context, "bram", baseURL!);
    await page.addInitScript(() => {
      const w = window as any;
      const t0 = Date.now();
      setInterval(() => {
        try {
          const key = Object.keys(document).find((k) => k.startsWith("__reactContainer$"));
          const root = key ? (document as any)[key].stateNode : null;
          const log = JSON.parse(sessionStorage.getItem("lanes") || "[]");
          log.push(`${new Date().toISOString().slice(17, 23)} p=${root ? (root.pendingLanes >>> 0).toString(2) : "-"} s=${root ? (root.suspendedLanes >>> 0).toString(2) : "-"} pi=${root ? root.pingedLanes : "-"}`);
          sessionStorage.setItem("lanes", JSON.stringify(log.slice(-60)));
        } catch {}
      }, 200);
      void t0;
    });
    let loads = 0;
    page.on("load", () => loads++);
    await page.goto("/dashboard/cover");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => sessionStorage.setItem("lanes", "[]"));
    const before = loads;
    const box = page.locator(`#request-${plan.cases[0].requests.bram}`);
    await box.getByRole("button", { name: /^Accept/ }).click();
    await page.waitForTimeout(9000);
    const extra = loads - before;
    const log = await page.evaluate(() => JSON.parse(sessionStorage.getItem("lanes") || "[]"));
    const busy = log.filter((l: string) => !/p=0 /.test(l));
    console.log(`probe ${n}: extra loads ${extra}; non-idle samples ${busy.length}/${log.length}` + (busy.length > 10 ? "\n  " + log.slice(-31).filter((_: string, i: number) => i % 4 === 0).join("\n  ") : ""));
  });
