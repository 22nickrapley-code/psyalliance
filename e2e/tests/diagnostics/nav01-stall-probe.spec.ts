import { test } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// NAV-01 probe (diagnostic, not part of the acceptance run). Sends a message
// from the compose page several times and records, for each send, whether
// the conversation opened by itself (soft navigation) or only after a full
// page load (the candidate's watchdog), or not at all (a stall).
//   E2E_BASE_URL=http://localhost:3601 npx playwright test --project=diagnostics
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

for (let n = 0; n < Number(process.env.PROBES || 6); n++)
  test(`NAV-01 probe ${n}`, async ({ page, context, baseURL }, info) => {
    let loads = 0;
    page.on("load", () => loads++);
    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/messages?to=${account(process.env.TO || "bram").id}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500); // a person reads and types
    const text = `NAV-01 probe ${n} ${Date.now()}`;
    await page.getByPlaceholder(/Write a professional message/).fill(text);
    const loadsBefore = loads;
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForTimeout(6000);
    const shown = await page.getByText(text).first().isVisible().catch(() => false);
    const outcome = !shown ? "stalled" : loads > loadsBefore ? "recovered-by-full-load" : "soft-navigation";
    await info.attach("outcome.json", { body: JSON.stringify({ outcome, url: page.url() }), contentType: "application/json" });
    console.log(`NAV-01 ${n}: ${outcome}`);
  });
