import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Hydration probe (diagnostic): opens pages repeatedly and counts React
// hydration errors (#418/#423/#425), which mean the server and the browser
// drew different text.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
const PAGES = (process.env.PAGES || "/dashboard/consult/new,/dashboard/availability,/dashboard/demos").split(",");

for (const role of (process.env.ROLES || "avery").split(","))
  test(`hydration probe @${role}`, async ({ page, context, baseURL }) => {
    test.setTimeout(300000);
    await signInAs(context, role, baseURL!);
    const tally: Record<string, number> = {};
    const msgs: string[] = [];
    let current = "";
    page.on("pageerror", (e) => {
      if (/#41[89]|#42[35]|[Hh]ydrat/.test(e.message)) {
        tally[current] = (tally[current] || 0) + 1;
        msgs.push(`${current}: ${e.message.slice(0, 160)}`);
      }
    });
    page.on("console", (m) => m.type() === "error" && /[Hh]ydrat|did not match|mismatch/.test(m.text()) && msgs.push(`${current} console: ${m.text().slice(0, 1500)}`));
    for (let i = 0; i < Number(process.env.N || 5); i++)
      for (const p of PAGES) {
        current = p;
        await page.goto(p);
        await page.waitForLoadState("networkidle");
      }
    console.log(JSON.stringify(tally), "\n" + msgs.slice(0, 6).join("\n"));
  });
