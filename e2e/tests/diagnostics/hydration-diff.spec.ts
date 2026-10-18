import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// HYD-01 diagnostic: loads dashboard pages as several members at once (as
// the route sweep does) and, whenever React reports a hydration error,
// saves the HTML the server sent and the page as the browser ended up
// drawing it, so the two can be compared to find what differed.
test.describe.configure({ mode: "parallel" });
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
const ROUTES: string[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "register/routes.json"), "utf8")).pages;
const PAGES = (process.env.PAGES ? process.env.PAGES.split(",") : ROUTES.filter((r) => r.startsWith("/dashboard") && !r.includes("[")));
const OUT = path.join(process.cwd(), "reports", "hydration-diff");

for (const role of (process.env.ROLES || "avery,pell,sol,esme,ruben,bram").split(","))
  test(`hydration diff @${role}`, async ({ page, context, baseURL }) => {
    test.setTimeout(30 * 60_000);
    fs.mkdirSync(OUT, { recursive: true });
    await signInAs(context, role, baseURL!);
    let errors: string[] = [];
    page.on("console", (m) => {
      if (m.text().startsWith("PA-RECOVERABLE")) errors.push(m.text().slice(0, 6000));
    });
    page.on("pageerror", (e) => {
      if (/#41[89]|#42[35]|[Hh]ydrat/.test(e.message)) errors.push(e.message.slice(0, 300));
    });
    let loads = 0;
    let hits = 0;
    for (let i = 0; i < Number(process.env.N || 2); i++)
      for (const p of PAGES) {
        errors = [];
        const resp = await page.goto(p).catch(() => null);
        const html = resp ? await resp.text().catch(() => "") : "";
        await page.waitForLoadState("networkidle").catch(() => null);
        loads++;
        if (errors.length) {
          hits++;
          const slug = `${role}-${i}-${p.replace(/[^a-z0-9]+/gi, "_")}`;
          fs.writeFileSync(path.join(OUT, `${slug}.server.html`), html);
          fs.writeFileSync(path.join(OUT, `${slug}.client.html`), await page.content());
          fs.writeFileSync(path.join(OUT, `${slug}.errors.txt`), errors.join("\n"));
        }
      }
    console.log(`@${role}: ${hits} hydration errors in ${loads} loads`);
  });
