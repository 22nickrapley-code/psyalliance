import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";

// Against a development build: React prints what differed when a page
// draws differently on the server and in the browser.
const PAGES = ["/dashboard", "/dashboard/documents", "/dashboard/availability", "/dashboard/consult/new", "/dashboard/demos", "/dashboard/cover", "/dashboard/refer", "/dashboard/clinicians"];
for (const role of ["avery", "pell", "sol"])
  test(`hydration dev @${role}`, async ({ page, context, baseURL }) => {
    test.setTimeout(600000);
    await signInAs(context, role, baseURL!);
    const msgs: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/hydrat|did not match|mismatch|server rendered/i.test(t)) msgs.push(t.slice(0, 2500));
    });
    page.on("pageerror", (e) => msgs.push("pageerror: " + e.message.slice(0, 1500)));
    for (let i = 0; i < Number(process.env.N || 3); i++)
      for (const p of PAGES) {
        await page.goto(p, { timeout: 120000 });
        await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => null);
      }
    console.log(`@${role} found ${msgs.length}\n` + [...new Set(msgs)].slice(0, 3).join("\n----\n"));
  });
